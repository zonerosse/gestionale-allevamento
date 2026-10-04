import { json, role, deny } from "../_lib.js";
/* "🌐 Pubblica sul sito" (ottobre 2026): il gestionale scrive nel repository del sito con un solo commit su main.
   Chiave: segreto Cloudflare GITHUB_TOKEN (fine-grained, solo zonerosse/delpiccolodiavolo-hugo, Contents: Read and write).
   Corpo: { message,
     files:  [{ path, b64, guard? }]  guard=true: se il file c'è già e non contiene "gestionale: true" NON si tocca
                                      (pagine del Diario scritte a mano da Paolo);
     blocks: [{ path, html, lastmod? }]       sostituisce il testo fra <!-- GESTIONALE:INIZIO --> e <!-- GESTIONALE:FINE -->; se i
                                      segnaposto mancano li mette prima della prima <article class="litter-card">, con il
                                      rientro della riga (custom_content è un blocco YAML);
     deletes:[{ path }] }             cancella solo file con "gestionale: true".
   Solo l'admin (Paolo). Risposta: { ok, commit | unchanged, skipped:[percorsi non toccati] }. */
const REPO = "zonerosse/delpiccolodiavolo-hugo", BRANCH = "main", API = "https://api.github.com/repos/" + REPO;
const A = "<!-- GESTIONALE:INIZIO -->", Z = "<!-- GESTIONALE:FINE -->", OWN = /^gestionale:\s*true\s*$/m;
const okPath = p => /^(data|static|content|assets|i18n)\/[\w\-./]+$/.test(p || "") && !p.includes("..");
const u8b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
const b64txt = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  if (!env.GITHUB_TOKEN) return json({ ok: false, error: "Manca la chiave GITHUB_TOKEN in Cloudflare (Settings → Variables and Secrets)." }, 200);
  const gh = async (path, method = "GET", body, soft404) => {
    const r = await fetch(API + path, { method, headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json",
      "User-Agent": "gestionale-delpiccolodiavolo", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    if (soft404 && r.status === 404) return null;
    const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
    if (!r.ok) throw new Error("GitHub " + r.status + ": " + (j.message || t).slice(0, 200));
    return j;
  };
  const read = async p => { const j = await gh("/contents/" + p.split("/").map(encodeURIComponent).join("/") + "?ref=" + BRANCH, "GET", null, true); return j && j.content != null ? b64txt(j.content) : null; };
  try {
    const { message, files = [], blocks = [], deletes = [] } = await request.json();
    if (!files.length && !blocks.length && !deletes.length) return json({ error: "Niente da pubblicare." }, 400);
    for (const f of [...files, ...blocks, ...deletes]) if (!okPath(f.path)) return json({ error: "Percorso non permesso: " + f.path }, 400);
    const ref = await gh("/git/ref/heads/" + BRANCH), head = ref.object.sha, base = (await gh("/git/commits/" + head)).tree.sha;
    const tree = [], skipped = [];
    const blob = async b64 => (await gh("/git/blobs", "POST", { content: b64, encoding: "base64" })).sha;
    for (const f of files) {
      if (f.guard) { const cur = await read(f.path); if (cur != null && !OWN.test(cur)) { skipped.push(f.path); continue; } }
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: await blob(f.b64) });
    }
    for (const b of blocks) {
      const cur = await read(b.path); if (cur == null) { skipped.push(b.path); continue; }
      let out;
      if (cur.includes(A) && cur.includes(Z)) {
        const i = cur.indexOf(A), j = cur.indexOf(Z), ls = cur.lastIndexOf("\n", i) + 1, ind = cur.slice(ls, i);
        out = cur.slice(0, i) + A + "\n" + (b.html ? b.html.split("\n").map(x => x ? ind + x : "").join("\n") + "\n\n" : "") + ind + cur.slice(j);
      } else {
        if (!b.html) continue;
        const k = cur.indexOf('<article class="litter-card"'); if (k < 0) { skipped.push(b.path); continue; }
        const ls = cur.lastIndexOf("\n", k) + 1, ind = cur.slice(ls, k);
        out = cur.slice(0, ls) + ind + A + "\n" + b.html.split("\n").map(x => x ? ind + x : "").join("\n") + "\n\n" + ind + Z + "\n\n" + cur.slice(ls);
      }
      // la pagina è cambiata: data di aggiornamento di oggi (Google e IndexNow vedono che è nuova), solo nel front matter
      if (out !== cur && b.lastmod && /^\d{4}-\d{2}-\d{2}$/.test(b.lastmod)) { const e = out.indexOf("\n---", 3); if (e > 0) out = out.slice(0, e).replace(/^lastmod:.*$/m, "lastmod: " + b.lastmod) + out.slice(e); }
      if (out !== cur) tree.push({ path: b.path, mode: "100644", type: "blob", sha: await blob(u8b64(new TextEncoder().encode(out))) });
    }
    for (const d of deletes) { const cur = await read(d.path); if (cur == null) continue; if (!OWN.test(cur)) { skipped.push(d.path); continue; } tree.push({ path: d.path, mode: "100644", type: "blob", sha: null }); }
    if (!tree.length) return json({ ok: true, unchanged: true, skipped });
    const nt = await gh("/git/trees", "POST", { base_tree: base, tree });
    if (nt.sha === base) return json({ ok: true, unchanged: true, skipped });
    const c = await gh("/git/commits", "POST", { message: message || "Aggiornamento dal gestionale", tree: nt.sha, parents: [head] });
    await gh("/git/refs/heads/" + BRANCH, "PATCH", { sha: c.sha });
    return json({ ok: true, commit: c.sha.slice(0, 7), skipped });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, 200); } // 200: Cloudflare non deve coprire il messaggio
}
