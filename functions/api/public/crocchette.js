import { json } from "../../_lib.js";

/* Elenco comune delle crocchette (18/10/2026, Paolo: "una sorta di database, in automatico, dopo un tuo controllo").
   Chi aggiunge una crocchetta nel calcolatore (sito, pagina del proprietario, gestionale) la propone qui. Claude la controlla
   (il prodotto esiste? le kcal tornano con il produttore o con i componenti analitici?) e sistema marca e nome: se va bene
   entra nell'elenco per tutti, se no resta solo nel browser di chi l'ha scritta. Paolo vede tutto e cancella da
   Quanto mangia → «Crocchette aggiunte dagli utenti» (/api/crocchette).
   Limiti per i costi: LIMITE_GIORNO controlli di Claude al giorno per tutti, LIMITE_VISITATORE proposte per visitatore
   (impronta = hash di IP + giorno, l'IP non si salva). */
const SITI = ["https://delpiccolodiavolo.it", "https://www.delpiccolodiavolo.it", "https://gestionale.delpiccolodiavolo.it"];
const LIMITE_GIORNO = 20, LIMITE_VISITATORE = 5, MODEL = "claude-sonnet-5-5";
const cors = o => ({ "access-control-allow-origin": SITI.includes(o) ? o : SITI[0], "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "Origin", "x-robots-tag": "noindex" });
export async function onRequestOptions({ request }) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "") }); }

export async function ensureCrocchette(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crocchette (id TEXT PRIMARY KEY, k TEXT, brand TEXT, name TEXT, name_en TEXT, kcal INTEGER, status TEXT, reason TEXT, url TEXT, src TEXT, sent TEXT, origin TEXT, created TEXT)").run();
  try { await env.DB.prepare("ALTER TABLE crocchette ADD COLUMN comp TEXT").run(); } catch (e) {} // componenti analitici [p,f,fi,a,u]
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS crocch_lim (day TEXT, who TEXT, n INTEGER, PRIMARY KEY (day, who))").run();
}
export const croKey = (b, n) => (String(b || "") + " " + String(n || "")).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
const cj = t => { try { const c = JSON.parse(t || "null"); return Array.isArray(c) ? c : null; } catch (e) { return null; } };
const num = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;

async function claude(env, system, content, max, tools) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ model: MODEL, max_tokens: max, system: system + "\nRispondi SOLO con un oggetto JSON valido, senza altro testo.", messages: [{ role: "user", content }] }, tools ? { tools } : {})) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("claude " + r.status);
  const t = (j.content || []).filter(c => c.type === "text").map(c => c.text || "").join("").replace(/```json|```/g, "");
  const z = t.lastIndexOf("}");
  for (let i = t.indexOf("{"); i >= 0 && i < z; i = t.indexOf("{", i + 1)) { try { const v = JSON.parse(t.slice(i, z + 1)); if (v && typeof v === "object") return v; } catch (e) {} }
  return {};
}

export async function onRequestGet({ request, env }) {
  const H = Object.assign(cors(request.headers.get("origin") || ""), { "cache-control": "public, max-age=60" });
  await ensureCrocchette(env);
  const r = await env.DB.prepare("SELECT id, brand, name, name_en, kcal, comp FROM crocchette WHERE status = 'ok' ORDER BY brand, name LIMIT 1000").all();
  return json({ items: (r.results || []).map(x => ({ id: "u_" + x.id, brand: x.brand, name: x.name, en: x.name_en || "", kcal: x.kcal, src: "u", c: cj(x.comp) })) }, 200, H);
}

async function overLimit(request, env) {
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const ip = request.headers.get("cf-connecting-ip") || "?";
  const hb = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(day + "|" + ip + "|crocchette"));
  const who = [...new Uint8Array(hb)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
  const get = async w => ((await env.DB.prepare("SELECT n FROM crocch_lim WHERE day = ? AND who = ?").bind(day, w).first()) || { n: 0 }).n;
  if (await get("*") >= LIMITE_GIORNO || await get(who) >= LIMITE_VISITATORE) return true;
  for (const w of ["*", who]) await env.DB.prepare("INSERT INTO crocch_lim (day, who, n) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET n = n + 1").bind(day, w).run();
  await env.DB.prepare("DELETE FROM crocch_lim WHERE day < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).run();
  return false;
}
// Dal solo nome: Claude cerca il prodotto in internet (produttore o negozi seri) e trova kcal e componenti; se li trova la
// crocchetta entra subito nell'elenco comune (i dati vengono dalla fonte, non dall'utente).
async function findByName(request, env, H, q, o) {
  if (q.replace(/[^\p{L}\p{N}]/gu, "").length < 4) return json({ ok: false, status: "nome" }, 200, H);
  await ensureCrocchette(env);
  const k = croKey("", q);
  const all = (await env.DB.prepare("SELECT * FROM crocchette WHERE status = 'ok'").all()).results || [];
  const w = k.split(" ").filter(x => x.length > 1);
  const hit = all.map(x => ({ x, n: w.filter(t => (x.k || "").includes(t)).length })).sort((a, b) => b.n - a.n)[0];
  if (hit && hit.n >= Math.max(2, w.length)) { const x = hit.x; return json({ ok: true, status: "ok", item: { id: "u_" + x.id, brand: x.brand, name: x.name, en: x.name_en || "", kcal: x.kcal, src: "u", c: cj(x.comp) } }, 200, H); }
  if (!env.ANTHROPIC_API_KEY) return json({ ok: true, status: "limit" }, 200, H);
  if (await overLimit(request, env)) return json({ ok: true, status: "limit" }, 200, H);
  let x;
  try {
    x = await claude(env, `Un utente cerca i dati di una crocchetta (cibo secco per cani) scrivendo solo il nome: "${q}".
Cerca in internet il prodotto (sito del produttore, versione europea/italiana; altrimenti negozi seri come Zooplus, Arcaplanet, Maxi Zoo).
Se il nome è ambiguo (più versioni: puppy/adult, taglie, gusti) scegli la più probabile e scrivila per intero nel nome.
Riporta: marca e nome come li scrive il produttore (gusto in italiano), nome in inglese, energia metabolizzabile in kcal per 100 g
(3850 kcal/kg = 385; se non è pubblicata calcolala dai componenti: 3,5 × proteina + 8,5 × grassi + 3,5 × (100 − proteina − grassi − fibra − ceneri − umidità; umidità 10 se manca)),
i componenti analitici in % (proteina, grassi, fibra, ceneri, umidità; null se non pubblicati), il link della fonte.
"found": true solo se hai trovato il prodotto vero con almeno proteina e grassi o le kcal. Non inventare.
Formato: {"found":true,"brand":"","name":"","name_en":"","kcal":0,"kcalSrc":"produttore|calcolate","p":null,"f":null,"fi":null,"a":null,"u":null,"url":""}`,
      [{ type: "text", text: q }], 1500, [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]);
  } catch (e) { return json({ ok: true, status: "limit" }, 200, H); }
  let kc = num(x && x.kcal); if (kc && kc > 1000) kc = kc / 10;
  const P = num(x && x.p), F = num(x && x.f);
  if ((!kc || kc < 250 || kc > 600) && P != null && F != null) { const u = num(x.u) == null ? 10 : num(x.u); kc = 3.5 * P + 8.5 * F + 3.5 * Math.max(0, 100 - P - F - (num(x.fi) || 0) - (num(x.a) || 0) - u); }
  if (!x || !x.found || !kc || kc < 250 || kc > 600) return json({ ok: true, status: "notfound" }, 200, H);
  const B = String(x.brand || "").slice(0, 80), N = String(x.name || q).slice(0, 120), K = Math.round(kc), k2 = croKey(B, N);
  const CC = P != null && F != null ? [P, F, num(x.fi), num(x.a), num(x.u)] : null;
  const dup = await env.DB.prepare("SELECT * FROM crocchette WHERE k = ? AND status = 'ok'").bind(k2).first();
  if (dup) return json({ ok: true, status: "ok", item: { id: "u_" + dup.id, brand: dup.brand, name: dup.name, en: dup.name_en || "", kcal: dup.kcal, src: "u", c: cj(dup.comp) } }, 200, H);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await env.DB.prepare("INSERT INTO crocchette (id, k, brand, name, name_en, kcal, status, reason, url, src, sent, origin, created, comp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, k2, B, N, String(x.name_en || "").slice(0, 120), K, "ok", "Trovata da Claude dal nome (" + (x.kcalSrc === "calcolate" ? "kcal calcolate dai componenti" : "kcal del produttore") + ").",
      String(x.url || "").slice(0, 300), "w", JSON.stringify({ name: q }), o.includes("gestionale") ? "gestionale" : "sito", new Date().toISOString(), CC ? JSON.stringify(CC) : null).run();
  return json({ ok: true, status: "ok", found: true, item: { id: "u_" + id, brand: B, name: N, en: String(x.name_en || ""), kcal: K, src: "u", c: CC }, url: String(x.url || "") }, 200, H);
}

export async function onRequestPost({ request, env }) {
  const o = request.headers.get("origin") || "", H = cors(o);
  if (!SITI.includes(o)) return json({ ok: false, error: "Solo dal sito." }, 403, H);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Dati non validi" }, 400, H); }
  const brand = String(b.brand || "").trim().slice(0, 80), name = String(b.name || "").trim().slice(0, 120);
  if (b.find) return findByName(request, env, H, (brand + " " + name).trim(), o); // 🔎 «Trova i dati dal nome» (18/10/2026, Paolo)
  const kcal = Math.round(num(b.kcal) || 0), how = ["m", "c", "f"].includes(b.how) ? b.how : "m";
  const c = b.comp || {}, comp = { p: num(c.p), f: num(c.f), fi: num(c.fi), a: num(c.a), u: num(c.u) };
  if ((brand + name).replace(/[^\p{L}\p{N}]/gu, "").length < 4) return json({ ok: false, status: "no", reason: "nome" }, 200, H);
  if (!(kcal >= 250 && kcal <= 600)) return json({ ok: false, status: "no", reason: "kcal" }, 200, H);
  await ensureCrocchette(env);
  const k = croKey(brand, name);
  const old = await env.DB.prepare("SELECT * FROM crocchette WHERE k = ? AND status IN ('ok','del') ORDER BY created DESC").bind(k).first();
  if (old && old.status === "ok") return json({ ok: true, status: "ok", dup: true, item: { id: "u_" + old.id, brand: old.brand, name: old.name, en: old.name_en || "", kcal: old.kcal, src: "u", c: cj(old.comp) } }, 200, H);
  if (old && old.status === "del") return json({ ok: true, status: "no", reason: "tolta" }, 200, H);
  const no = await env.DB.prepare("SELECT reason FROM crocchette WHERE k = ? AND status = 'no' AND kcal = ? ORDER BY created DESC").bind(k, kcal).first();
  if (no) return json({ ok: true, status: "no", reason: no.reason || "" }, 200, H); // già scartata con gli stessi dati: niente nuovo controllo
  if (!env.ANTHROPIC_API_KEY) return json({ ok: true, status: "wait" }, 200, H);
  if (await overLimit(request, env)) return json({ ok: true, status: "limit" }, 200, H);
  let x;
  try {
    x = await claude(env, `Controlli una crocchetta (cibo secco per cani) che un utente vuole aggiungere a un elenco pubblico di un calcolatore delle razioni.
Dati dell'utente: marca, nome, kcal per 100 g, come le ha avute (m = scritte a mano, c = calcolate dai componenti analitici, f = lette dalla foto del sacco), eventuali componenti analitici.
1. Cerca in internet il prodotto (sito del produttore o negozi seri, versione europea). Esiste davvero ed è cibo secco per cani?
2. Trova l'energia metabolizzabile pubblicata (kcal per 100 g; 3850 kcal/kg = 385). Se non è pubblicata, calcolala dai componenti analitici pubblicati: 3,5 × proteina + 8,5 × grassi + 3,5 × (100 − proteina − grassi − fibra − ceneri − umidità; umidità 10 se manca).
3. Decidi:
   - "ok" se il prodotto esiste e le kcal dell'utente sono entro il 7% del valore trovato (usa il valore trovato, arrotondato);
   - "ok" anche se non trovi il valore ma il prodotto esiste e le kcal dell'utente tornano con i componenti che ti ha dato (entro il 7%) e sono fra 300 e 480;
   - "no" se il prodotto non esiste, non è cibo secco per cani, il testo è uno scherzo o un insulto, le kcal sono sbagliate e non riesci a correggerle, oppure non riesci a verificare niente.
4. Riporta i componenti analitici pubblicati del prodotto (proteina, grassi, fibra, ceneri, umidità in %; null se non pubblicati); se non li trovi ma ok è deciso sui componenti dell'utente, usa quelli.
5. Scrivi marca e nome come li scrive il produttore (maiuscole giuste, marca separata dal nome; gusto in italiano, es. "pollo e riso") e il nome in inglese (gusto in inglese).
Formato: {"verdict":"ok","brand":"","name":"","name_en":"","kcal":0,"p":null,"f":null,"fi":null,"a":null,"u":null,"url":"","reason":"una frase breve in italiano"}`,
      [{ type: "text", text: JSON.stringify({ marca: brand, nome: name, kcal, come: how, componenti: comp }) }], 1500,
      [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }]);
  } catch (e) { return json({ ok: true, status: "wait" }, 200, H); }
  const okv = x && x.verdict === "ok" && num(x.kcal) >= 250 && num(x.kcal) <= 600;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const B = String((okv && x.brand) || brand).slice(0, 80), N = String((okv && x.name) || name).slice(0, 120);
  const K = okv ? Math.round(num(x.kcal)) : kcal;
  const k2 = croKey(B, N);
  if (okv) {
    const dup = await env.DB.prepare("SELECT * FROM crocchette WHERE k = ? AND status = 'ok'").bind(k2).first();
    if (dup) return json({ ok: true, status: "ok", dup: true, item: { id: "u_" + dup.id, brand: dup.brand, name: dup.name, en: dup.name_en || "", kcal: dup.kcal, src: "u", c: cj(dup.comp) } }, 200, H);
  }
  const CC = okv && num(x.p) != null && num(x.f) != null ? [num(x.p), num(x.f), num(x.fi), num(x.a), num(x.u)] : (comp.p != null && comp.f != null ? [comp.p, comp.f, comp.fi, comp.a, comp.u] : null);
  await env.DB.prepare("INSERT INTO crocchette (id, k, brand, name, name_en, kcal, status, reason, url, src, sent, origin, created, comp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, okv ? k2 : k, B, N, String((x && x.name_en) || "").slice(0, 120), K, okv ? "ok" : "no", String((x && x.reason) || "").slice(0, 300),
      String((x && x.url) || "").slice(0, 300), how, JSON.stringify({ brand, name, kcal, comp }), o.includes("gestionale") ? "gestionale" : "sito", new Date().toISOString(), CC ? JSON.stringify(CC) : null).run();
  return json(okv ? { ok: true, status: "ok", item: { id: "u_" + id, brand: B, name: N, en: String(x.name_en || ""), kcal: K, src: "u", c: CC } }
    : { ok: true, status: "no", reason: String((x && x.reason) || "") }, 200, H);
}
