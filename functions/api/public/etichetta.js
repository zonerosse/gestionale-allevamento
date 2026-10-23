import { json } from "../../_lib.js";

/* Vitamine e minerali delle crocchette scelte dall'elenco (23/10/2026, Paolo: «tutto qui...?» guardando la tabella con solo proteine e grassi).
   Il calcolatore delle crocchette (sito, gestionale, pagina della famiglia) chiede qui calcio, fosforo e additivi nutrizionali per kg di una
   crocchetta che non li ha: Claude cerca in internet l'etichetta del produttore (o di negozi seri) e li riporta. La risposta si salva in D1
   (tabella etichette, per marca + nome): ogni crocchetta costa una sola ricerca, poi vale per tutti. Anche «non trovato» si salva (30 giorni).
   Limiti per i costi: LIMITE_GIORNO ricerche nuove al giorno per tutti, LIMITE_VISITATORE per visitatore (hash di IP + giorno, IP non salvato). */
const SITI = ["https://delpiccolodiavolo.it", "https://www.delpiccolodiavolo.it", "https://gestionale.delpiccolodiavolo.it", "null"];
const LIMITE_GIORNO = 40, LIMITE_VISITATORE = 8, MODEL = "claude-sonnet-5-5";
const ADD = ["va", "vd", "ve", "zn", "cu", "io", "fe", "se", "mn"];
const cors = o => ({ "access-control-allow-origin": SITI.includes(o) ? o : SITI[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "Origin", "x-robots-tag": "noindex" });
export async function onRequestOptions({ request }) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "") }); }
const num = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;
const key = (b, n) => (String(b || "") + " " + String(n || "")).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();

async function claude(env, text) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      system: `Cerchi l'etichetta di una crocchetta (cibo secco per cani) in internet: sito del produttore (versione italiana o europea), altrimenti negozi seri (Zooplus, Arcaplanet, Maxi Zoo).
Riporta SOLO quello che è scritto sull'etichetta, senza inventare:
- "ca","ph": calcio e fosforo in % (1,2% = 1.2; 12 g/kg = 1.2), null se non scritti;
- "add": additivi nutrizionali PER KG, null quelli non scritti: "va" vitamina A UI/kg, "vd" vitamina D3 UI/kg, "ve" vitamina E mg/kg (se in UI/kg stesso numero),
  "zn" zinco, "cu" rame, "io" iodio, "fe" ferro, "se" selenio, "mn" manganese in mg/kg (somma le forme dello stesso elemento; 1 g/kg = 1000 mg/kg);
- "url": la pagina da cui li hai presi; "found": true solo se hai trovato il prodotto giusto con almeno calcio/fosforo o un additivo.
Rispondi SOLO con un oggetto JSON: {"found":false,"ca":null,"ph":null,"add":{"va":null,"vd":null,"ve":null,"zn":null,"cu":null,"io":null,"fe":null,"se":null,"mn":null},"url":""}`,
      messages: [{ role: "user", content: [{ type: "text", text }] }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("claude " + r.status);
  const t = (j.content || []).filter(c => c.type === "text").map(c => c.text || "").join("").replace(/```json|```/g, "");
  const z = t.lastIndexOf("}");
  for (let i = t.indexOf("{"); i >= 0 && i < z; i = t.indexOf("{", i + 1)) { try { const v = JSON.parse(t.slice(i, z + 1)); if (v && typeof v === "object") return v; } catch (e) {} }
  return {};
}

export async function onRequestPost({ request, env }) {
  const o = request.headers.get("origin") || "", H = cors(o);
  if (!SITI.includes(o)) return json({ ok: false, error: "Solo dal sito." }, 403, H);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Dati non validi" }, 400, H); }
  const brand = String(b.brand || "").trim().slice(0, 80), name = String(b.name || "").trim().slice(0, 140), k = key(brand, name);
  if (k.replace(/ /g, "").length < 4) return json({ ok: false, status: "nome" }, 200, H);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS etichette (k TEXT PRIMARY KEY, v TEXT, found INTEGER, created TEXT)").run();
  const c = await env.DB.prepare("SELECT v, found, created FROM etichette WHERE k = ?").bind(k).first();
  if (c && (c.found || Date.now() - new Date(c.created) < 30 * 864e5)) { try { return json(Object.assign({ ok: true, cache: true }, JSON.parse(c.v)), 200, H); } catch (e) {} }
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, status: "limit" }, 200, H);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS etichette_lim (day TEXT, who TEXT, n INTEGER, PRIMARY KEY (day, who))").run();
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const hb = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(day + "|" + (request.headers.get("cf-connecting-ip") || "?") + "|etichetta"));
  const who = [...new Uint8Array(hb)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
  const get = async w => ((await env.DB.prepare("SELECT n FROM etichette_lim WHERE day = ? AND who = ?").bind(day, w).first()) || { n: 0 }).n;
  if (await get("*") >= LIMITE_GIORNO || await get(who) >= LIMITE_VISITATORE) return json({ ok: false, status: "limit" }, 200, H);
  for (const w of ["*", who]) await env.DB.prepare("INSERT INTO etichette_lim (day, who, n) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET n = n + 1").bind(day, w).run();
  await env.DB.prepare("DELETE FROM etichette_lim WHERE day < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).run();
  let x;
  try { x = await claude(env, `Crocchetta: marca «${brand}», nome «${name}»` + (num(b.kcal) ? `, ${Math.round(num(b.kcal))} kcal per 100 g` : "") + "."); }
  catch (e) { return json({ ok: false, status: "wait" }, 200, H); }
  const r = { found: false, ca: null, ph: null, add: null, url: "" };
  for (const q of ["ca", "ph"]) { const v = num(x && x[q]); if (v != null && v > 0 && v < 5) r[q] = v; }
  const A = {}; let n = 0; for (const q of ADD) { const v = num(x && x.add && x.add[q]); if (v != null && v > 0 && v < 1e6) { A[q] = v; n++; } }
  if (n) r.add = A;
  r.found = !!(x && x.found) && (n > 0 || (r.ca != null && r.ph != null));
  if (r.found) r.url = String(x.url || "").slice(0, 300);
  await env.DB.prepare("INSERT OR REPLACE INTO etichette (k, v, found, created) VALUES (?, ?, ?, ?)").bind(k, JSON.stringify(r), r.found ? 1 : 0, new Date().toISOString()).run();
  return json(Object.assign({ ok: true }, r), 200, H);
}
