import { json, role, deny } from "../_lib.js";
/* "🌐 Pubblica sul sito" (ottobre 2026): il gestionale scrive i file nel repository del sito con un solo commit su main.
   Chiave: segreto Cloudflare GITHUB_TOKEN (fine-grained, solo zonerosse/delpiccolodiavolo-hugo, Contents: Read and write).
   Corpo: { message, files:[{ path:"data/cucciolate.json", b64:"…" }] }. Solo l'admin (Paolo). */
const REPO = "zonerosse/delpiccolodiavolo-hugo", BRANCH = "main", API = "https://api.github.com/repos/" + REPO;
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  if (!env.GITHUB_TOKEN) return json({ error: "Manca la chiave GITHUB_TOKEN in Cloudflare." }, 500);
  const gh = async (path, method = "GET", body) => {
    const r = await fetch(API + path, { method, headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json",
      "User-Agent": "gestionale-delpiccolodiavolo", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
    if (!r.ok) throw new Error("GitHub " + r.status + ": " + (j.message || t).slice(0, 200));
    return j;
  };
  try {
    const { message, files } = await request.json();
    if (!Array.isArray(files) || !files.length) return json({ error: "Nessun file da pubblicare." }, 400);
    for (const f of files) if (!/^(data|static|content|assets|i18n)\/[\w\-./]+$/.test(f.path || "") || f.path.includes("..")) return json({ error: "Percorso non permesso: " + f.path }, 400);
    const ref = await gh("/git/ref/heads/" + BRANCH), head = ref.object.sha, base = (await gh("/git/commits/" + head)).tree.sha;
    const tree = [];
    for (const f of files) { const b = await gh("/git/blobs", "POST", { content: f.b64, encoding: "base64" }); tree.push({ path: f.path, mode: "100644", type: "blob", sha: b.sha }); }
    const nt = await gh("/git/trees", "POST", { base_tree: base, tree });
    if (nt.sha === base) return json({ ok: true, unchanged: true });
    const c = await gh("/git/commits", "POST", { message: message || "Aggiornamento dal gestionale", tree: nt.sha, parents: [head] });
    await gh("/git/refs/heads/" + BRANCH, "PATCH", { sha: c.sha });
    return json({ ok: true, commit: c.sha.slice(0, 7) });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
