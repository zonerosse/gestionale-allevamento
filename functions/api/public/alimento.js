import { json } from "../../_lib.js";

/* «Altro» nel calcolatore BARF del sito (23/10/2026, Paolo: "ad ogni voce per alimento aggiungi altro, e in base a quanto scritto ricalcola").
   Il visitatore scrive un alimento (es. «cuore di tacchino»); Claude dà i valori medi per 100 g crudi, come la banca dati USDA SR28
   usata dal calcolatore. Le risposte si salvano in D1 (tabella alimenti) per nome e gruppo: lo stesso alimento scritto da un altro
   visitatore non costa una seconda lettura. Maiale e cinghiale crudi vengono rifiutati (Aujeszky), come i cibi tossici per il cane.
   Limiti per i costi: LIMITE_GIORNO letture nuove al giorno per tutti, LIMITE_VISITATORE per visitatore (impronta = hash di IP + giorno,
   l'IP non si salva). Origine "null" ammessa: le anteprime HTML che Paolo apre dal disco (i limiti valgono lo stesso). */
const SITI = ["https://delpiccolodiavolo.it", "https://www.delpiccolodiavolo.it", "https://gestionale.delpiccolodiavolo.it", "null"];
const LIMITE_GIORNO = 40, LIMITE_VISITATORE = 6, MODEL = "claude-sonnet-5-5";
const GRUPPI = { carne: "carne muscolare (o pesce, uova)", trippa: "trippa o stomaco", fegato: "fegato", organi: "altre frattaglie (reni, milza, cuore, polmone…)", ossa: "ossa carnose crude, valori dell'osso intero con la carne attaccata (calcio e fosforo dell'osso compresi)", verdure: "verdura", frutta: "frutta" };
const CAMPI = ["kcal", "p", "f", "ca", "ph", "zn", "cu", "va", "vd", "ve", "io", "o3"];
const MAX = { kcal: 900, p: 90, f: 100, ca: 40000, ph: 20000, zn: 200, cu: 50, va: 200000, vd: 20000, ve: 300, io: 100000, o3: 60 };
const cors = o => ({ "access-control-allow-origin": SITI.includes(o) ? o : SITI[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "Origin", "x-robots-tag": "noindex" });
export async function onRequestOptions({ request }) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "") }); }
const num = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;
const chiave = (g, s) => g + ":" + String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();

async function claude(env, system, text) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: system + "\nRispondi SOLO con un oggetto JSON valido, senza altro testo.", messages: [{ role: "user", content: [{ type: "text", text }] }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("claude " + r.status);
  const t = (j.content || []).filter(c => c.type === "text").map(c => c.text || "").join("").replace(/```json|```/g, "");
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  return a >= 0 && z > a ? JSON.parse(t.slice(a, z + 1)) : {};
}

export async function onRequestPost({ request, env }) {
  const o = request.headers.get("origin") || "", H = cors(o);
  if (!SITI.includes(o)) return json({ ok: false, error: "Solo dal sito." }, 403, H);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Dati non validi" }, 400, H); }
  const g = String(b && b.g || ""), nome = String(b && b.nome || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!GRUPPI[g] || nome.length < 2) return json({ ok: false, error: "Scrivi l'alimento." }, 400, H);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS alimenti (k TEXT PRIMARY KEY, g TEXT, nome TEXT, v TEXT, created TEXT)").run();
  const k = chiave(g, nome);
  const c = await env.DB.prepare("SELECT v FROM alimenti WHERE k = ?").bind(k).first();
  if (c) { try { return json(Object.assign({ ok: true, cache: true }, JSON.parse(c.v)), 200, H); } catch (e) {} }
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, limit: true }, 200, H);
  // limiti
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS alimenti_lim (day TEXT, who TEXT, n INTEGER, PRIMARY KEY (day, who))").run();
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const ip = request.headers.get("cf-connecting-ip") || "?";
  const hb = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(day + "|" + ip + "|alimento"));
  const who = [...new Uint8Array(hb)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
  const get = async w => ((await env.DB.prepare("SELECT n FROM alimenti_lim WHERE day = ? AND who = ?").bind(day, w).first()) || { n: 0 }).n;
  if (await get("*") >= LIMITE_GIORNO || await get(who) >= LIMITE_VISITATORE) return json({ ok: false, limit: true }, 200, H);
  for (const w of ["*", who]) await env.DB.prepare("INSERT INTO alimenti_lim (day, who, n) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET n = n + 1").bind(day, w).run();
  await env.DB.prepare("DELETE FROM alimenti_lim WHERE day < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).run();
  try {
    const x = await claude(env, `Sei un nutrizionista veterinario. Un visitatore di un calcolatore BARF (dieta cruda per cani) ha scritto un alimento per il gruppo «${GRUPPI[g]}».
Dai i valori medi per 100 g dell'alimento CRUDO, come nella banca dati USDA SR28 (o tabelle europee se l'alimento non c'è). Non inventare: se non sai un valore, null.
Unità: kcal; p proteine g; f grassi g; ca calcio mg; ph fosforo mg; zn zinco mg; cu rame mg; va vitamina A UI; vd vitamina D UI; ve vitamina E mg (alfa-tocoferolo); io iodio µg; o3 EPA+DHA g.
"no": metti un motivo breve in italiano (e "no_en", "no_de") e valori null se: non è un alimento; è maiale o cinghiale crudo (malattia di Aujeszky, mortale nel cane); è tossico per il cane (uva, uvetta, cipolla, aglio, porro, avocado, cioccolato, noci di macadamia, xilitolo…); è un osso cotto; non c'entra con il gruppo indicato.
"it","en","de": nome breve e corretto dell'alimento nelle tre lingue (es. "Cuore di tacchino", "Turkey heart", "Putenherz").
Formato: {"it":"","en":"","de":"","no":"","no_en":"","no_de":"","kcal":null,"p":null,"f":null,"ca":null,"ph":null,"zn":null,"cu":null,"va":null,"vd":null,"ve":null,"io":null,"o3":null}`, nome);
    const r = { n: { it: String(x.it || nome).slice(0, 60), en: String(x.en || x.it || nome).slice(0, 60), de: String(x.de || x.it || nome).slice(0, 60) } };
    if (x.no) { r.no = { it: String(x.no).slice(0, 200), en: String(x.no_en || x.no).slice(0, 200), de: String(x.no_de || x.no).slice(0, 200) }; }
    else {
      for (const q of CAMPI) { const v = num(x[q]); r[q] = v != null && v >= 0 && v <= MAX[q] ? Math.round(v * 1000) / 1000 : null; }
      if (!r.kcal || r.kcal < 5) return json({ ok: false, error: "valori non trovati" }, 200, H);
      if (r.o3 == null) r.o3 = 0;
      r.ai = 1;
    }
    await env.DB.prepare("INSERT OR REPLACE INTO alimenti (k, g, nome, v, created) VALUES (?, ?, ?, ?, ?)").bind(k, g, nome, JSON.stringify(r), new Date().toISOString()).run();
    return json(Object.assign({ ok: true }, r), 200, H);
  } catch (e) { return json({ ok: false, error: "lettura non riuscita" }, 200, H); }
}
