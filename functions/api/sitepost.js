import { json, can, deny } from "../_lib.js";
import { gbpGet, gbpSet, gbpToken, gget, gbpTable } from "../_gbp.js";
/* Pagina «Novità» del sito (23/10/2026, Paolo: scelte 1A pagina visibile a Google, 2A voce nel menu).
   I post del profilo Google, quando sono online (LIVE), vanno anche sul sito delpiccolodiavolo.it, da soli:
   - data/postgoogle.json  { updated, items:[{ id, date, it, en, de, img, alt:{it,en,de}, url }] }
   - static/images/novita-google/<id>.jpg   la foto del post, scaricata da Google
   un solo commit su main, come «Pubblica sul sito» (segreto GITHUB_TOKEN). Il testo inglese e tedesco e la descrizione
   della foto li scrive Claude una volta sola per post (tabella gbp, "sitepost:tr:<id>:<impronta del testo>").
   Il gestionale la chiama quando apre i post, dopo una pubblicazione e dopo un'eliminazione: se da Google non è cambiato
   niente (impronta in "sitepost:sig") non fa nulla e non tocca GitHub.
   POST {} → { ok, unchanged } | { ok, commit, n, more } | { ok:false, error }
   Solo i post dell'ultimo anno (scelta B); al massimo LOTTO post nuovi per chiamata: con more:true il gestionale richiama. */
const REPO = "zonerosse/delpiccolodiavolo-hugo", BRANCH = "main", API = "https://api.github.com/repos/" + REPO;
const LOTTO = 4, DIR = "static/images/novita-google", DATA = "data/postgoogle.json", MODEL = "claude-sonnet-5-5";
const hash = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
const u8b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
const b64txt = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));

// Testo in inglese e tedesco e descrizione breve della foto (se c'è), in un JSON
async function tradu(env, text, foto) {
  const system = "Traduci un post dell'allevamento di Staffordshire Bull Terrier Del Piccolo Diavolo (Ostellato, Italia) dall'italiano all'inglese e al tedesco. " +
    "Traduzione fedele e naturale, stesso tono e stessa lunghezza, niente aggiunte, a capo dove sono nell'originale. " +
    "Se c'è la foto, scrivi anche una descrizione breve (massimo 12 parole) di cosa si vede, in italiano, inglese e tedesco, senza inventare nomi che non sono nel testo. " +
    'Rispondi SOLO con JSON: {"en":"…","de":"…","alt":{"it":"…","en":"…","de":"…"}} (alt vuoti se non c\'è la foto).';
  const content = [];
  if (foto) content.push({ type: "image", source: { type: "base64", media_type: foto.type, data: foto.b64 } });
  content.push({ type: "text", text: text });
  for (let i = 0; i < 2; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Claude " + r.status + ": " + ((j.error && j.error.message) || "errore"));
    const t = (j.content || []).map(c => c.text || "").join(""), a = t.indexOf("{"), z = t.lastIndexOf("}");
    try { const o = JSON.parse(t.slice(a, z + 1)); if (o.en && o.de) return { en: String(o.en), de: String(o.de), alt: o.alt || {} }; } catch (e) {}
  }
  throw new Error("Claude non ha restituito la traduzione.");
}

export async function onRequestPost({ request, env }) {
  if (!(await can(request, env, "recensioni", 2))) return deny();
  try {
    if (!env.GITHUB_TOKEN) return json({ ok: false, error: "Manca la chiave GITHUB_TOKEN in Cloudflare." });
    const loc = await gbpGet(env, "loc"); if (!loc) return json({ ok: false, connect: true, error: "Il gestionale non è ancora collegato al profilo Google." });
    // scelta B di Paolo (23/10/2026): sul sito solo i post dell'ultimo anno; quelli più vecchi escono da soli
    const DAL = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const tk = await gbpToken(env), L = []; let tok = "";
    for (let pg = 0; pg < 3; pg++) {
      const j = await gget("https://mybusiness.googleapis.com/v4/" + loc + "/localPosts?pageSize=100" + (tok ? "&pageToken=" + encodeURIComponent(tok) : ""), tk);
      L.push(...(j.localPosts || [])); tok = j.nextPageToken; if (!tok) break;
    }
    const posts = L.filter(p => p.state === "LIVE" && (p.summary || "").trim()).map(p => ({
      id: String(p.name || "").split("/").pop().replace(/[^\w-]/g, ""), date: (p.createTime || "").slice(0, 10), it: String(p.summary).trim(),
      gimg: (p.media && p.media[0] && p.media[0].mediaFormat === "PHOTO" && p.media[0].googleUrl) || "",
      url: (p.callToAction && /^https:\/\/delpiccolodiavolo\.it\//.test(p.callToAction.url || "") && p.callToAction.url) || "" }))
      .filter(p => p.id && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date >= DAL).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 120);
    const sig = await hash(JSON.stringify(posts.map(p => [p.id, p.it, !!p.gimg, p.url])));
    if (sig === await gbpGet(env, "sitepost:sig")) return json({ ok: true, unchanged: true });

    const gh = async (path, method = "GET", body, soft404) => {
      const r = await fetch(API + path, { method, headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json",
        "User-Agent": "gestionale-delpiccolodiavolo", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      if (soft404 && r.status === 404) return null;
      const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
      if (!r.ok) throw new Error("GitHub " + r.status + ": " + (j.message || t).slice(0, 200));
      return j;
    };
    // tutte le traduzioni e le foto già preparate, con una sola lettura del database
    await gbpTable(env);
    const KV = new Map(((await env.DB.prepare("SELECT k,v FROM gbp WHERE k LIKE 'sitepost:%'").all()).results || []).map(r => [r.k, r.v]));
    const kset = async (k, v) => { KV.set(k, v); await env.DB.prepare("INSERT INTO gbp (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run(); };
    const there = new Set(((await gh("/contents/" + DIR + "?ref=" + BRANCH, "GET", null, true)) || []).map(f => f.name));
    const tree = [], blob = async b64 => (await gh("/git/blobs", "POST", { content: b64, encoding: "base64" })).sha, items = [];
    let fatti = 0, more = false;
    for (const p of posts) {
      const name = p.id + ".jpg", bk = "sitepost:blob:" + p.id;
      const tk2 = "sitepost:tr:" + p.id + ":" + await hash(p.it + (p.gimg ? "|f" : ""));
      let tr = null; try { tr = JSON.parse(KV.get(tk2) || "null"); } catch (e) {}
      let bsha = p.gimg && !there.has(name) ? (KV.get(bk) || null) : null;
      const todo = !tr || (p.gimg && !there.has(name) && !bsha);
      // Cloudflare limita le chiamate esterne per richiesta: i post nuovi si preparano a gruppi (foto già caricata su GitHub
      // come blob, traduzione salvata), il gestionale richiama da solo e il commit parte una volta sola, alla fine
      if (todo && fatti >= LOTTO) { more = true; continue; }
      if (todo) fatti++;
      let foto = null;
      if (p.gimg && !there.has(name) && !bsha) {
        // la foto del post, al massimo 1000 px di lato (Google accetta il ritaglio nell'indirizzo)
        let r = await fetch(p.gimg.replace(/=[^/=]*$/, "") + "=w1000-h1000").catch(() => null);
        if (!r || !r.ok) r = await fetch(p.gimg).catch(() => null);
        if (r && r.ok) { const u = new Uint8Array(await r.arrayBuffer()); foto = { b64: u8b64(u), type: (r.headers.get("content-type") || "image/jpeg").split(";")[0] };
          bsha = await blob(foto.b64); await kset(bk, bsha); }
      }
      if (!tr) { tr = await tradu(env, p.it, foto); await kset(tk2, JSON.stringify(tr)); }
      if (bsha && !there.has(name)) { tree.push({ path: DIR + "/" + name, mode: "100644", type: "blob", sha: bsha }); there.add(name); }
      const it = { id: p.id, date: p.date, it: p.it, en: tr.en, de: tr.de };
      if (there.has(name)) { it.img = "/images/novita-google/" + name; if (tr.alt && tr.alt.it) it.alt = { it: tr.alt.it, en: tr.alt.en || "", de: tr.alt.de || "" }; }
      if (p.url) it.url = p.url;
      items.push(it);
    }
    if (more) return json({ ok: true, more: true, done: items.length, total: posts.length });
    // foto di post eliminati da Google: via anche dal sito (solo in questa cartella)
    const keep = new Set(items.filter(i => i.img).map(i => i.id + ".jpg"));
    for (const n of there) if (/^[\w-]+\.jpg$/.test(n) && !keep.has(n)) tree.push({ path: DIR + "/" + n, mode: "100644", type: "blob", sha: null });
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const old = await gh("/contents/" + DATA + "?ref=" + BRANCH, "GET", null, true);
    let oldItems = null; try { oldItems = JSON.stringify((JSON.parse(b64txt(old.content)) || {}).items); } catch (e) {}
    const changed = oldItems !== JSON.stringify(items);
    if (changed) tree.push({ path: DATA, mode: "100644", type: "blob", sha: await blob(u8b64(new TextEncoder().encode(JSON.stringify({ updated: today, items }, null, 1) + "\n"))) });
    if (!tree.length) { await gbpSet(env, "sitepost:sig", sig); return json({ ok: true, unchanged: true }); }
    const ref = await gh("/git/ref/heads/" + BRANCH), head = ref.object.sha, base = (await gh("/git/commits/" + head)).tree.sha;
    const nt = await gh("/git/trees", "POST", { base_tree: base, tree });
    if (nt.sha === base) { await gbpSet(env, "sitepost:sig", sig); return json({ ok: true, unchanged: true }); }
    const c = await gh("/git/commits", "POST", { message: "Novità: post del profilo Google (dal gestionale)", tree: nt.sha, parents: [head] });
    await gh("/git/refs/heads/" + BRANCH, "PATCH", { sha: c.sha });
    await gbpSet(env, "sitepost:sig", sig);
    return json({ ok: true, commit: c.sha.slice(0, 7), n: items.length });
  } catch (e) { return json({ ok: false, connect: !!e.connect, error: String(e.message || e) }); }
}
