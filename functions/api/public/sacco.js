import { json } from "../../_lib.js";

/* Foto del sacco dal calcolatore delle crocchette del sito (18/10/2026, Paolo: scelta A).
   Claude legge le kcal (o i componenti analitici, o solo il nome e allora cerca in internet). Ogni lettura la paga la chiave
   di Paolo, quindi: al massimo LIMITE_GIORNO letture al giorno per tutti i visitatori insieme e LIMITE_VISITATORE per visitatore
   (impronta = hash di IP + giorno, l'IP non si salva). La foto non si salva. Solo da delpiccolodiavolo.it e dalla pagina del proprietario nel gestionale. */
const SITI = ["https://delpiccolodiavolo.it", "https://www.delpiccolodiavolo.it", "https://gestionale.delpiccolodiavolo.it"]; // gestionale: pagina del proprietario («Quanto mangia», 18/10/2026)
const LIMITE_GIORNO = 30, LIMITE_VISITATORE = 3, MODEL = "claude-sonnet-5-5";
const cors = o => ({ "access-control-allow-origin": SITI.includes(o) ? o : SITI[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "vary": "Origin", "x-robots-tag": "noindex" });
export async function onRequestOptions({ request }) { return new Response(null, { status: 204, headers: cors(request.headers.get("origin") || "") }); }

async function claude(env, system, content, max, tools) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ model: MODEL, max_tokens: max, system: system + "\nRispondi SOLO con un oggetto JSON valido, senza altro testo.", messages: [{ role: "user", content }] }, tools ? { tools } : {})) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("claude " + r.status);
  const t = (j.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "");
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  return a >= 0 && z > a ? JSON.parse(t.slice(a, z + 1)) : {};
}
const n = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;

export async function onRequestPost({ request, env }) {
  const o = request.headers.get("origin") || "", H = cors(o);
  if (!SITI.includes(o)) return json({ ok: false, error: "Solo dal sito." }, 403, H);
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, limit: true }, 200, H);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Dati non validi" }, 400, H); }
  const parts = (Array.isArray(b && b.parts) ? b.parts : []).slice(0, 2).map(x => String(x || "").replace(/^data:[^,]*,/, "")).filter(x => x && x.length < 2.2e6);
  if (!parts.length) return json({ ok: false, error: "Manca la foto." }, 400, H);
  // limiti
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS sacco (day TEXT, who TEXT, n INTEGER, PRIMARY KEY (day, who))").run();
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const ip = request.headers.get("cf-connecting-ip") || "?";
  const hb = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(day + "|" + ip + "|sacco"));
  const who = [...new Uint8Array(hb)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
  const get = async w => ((await env.DB.prepare("SELECT n FROM sacco WHERE day = ? AND who = ?").bind(day, w).first()) || { n: 0 }).n;
  if (await get("*") >= LIMITE_GIORNO || await get(who) >= LIMITE_VISITATORE) return json({ ok: false, limit: true }, 200, H);
  for (const w of ["*", who]) await env.DB.prepare("INSERT INTO sacco (day, who, n) VALUES (?, ?, 1) ON CONFLICT(day, who) DO UPDATE SET n = n + 1").bind(day, w).run();
  await env.DB.prepare("DELETE FROM sacco WHERE day < ?").bind(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).run();
  try {
    const x = await claude(env, `Leggi le foto di un sacco di crocchette per cani (fronte e/o retro). Estrai SOLO quello che è scritto, senza inventare.
- "brand": marca; "name": nome del prodotto (linea, taglia, età, gusto), come scritto.
- "kcal": energia metabolizzabile in kcal per 100 g SOLO se è scritta (converti: 3850 kcal/kg = 385; 16,1 MJ/kg = 385). null se non è scritta.
- "p","f","fi","a","u": proteina grezza, grassi, fibra grezza, ceneri grezze, umidità in %. null se non scritti.
Se la foto non è un sacco di cibo per cani: tutto vuoto o null.
Formato: {"brand":"","name":"","kcal":null,"p":null,"f":null,"fi":null,"a":null,"u":null}`,
      [...parts.map(d => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d } })), { type: "text", text: "Foto del sacco." }], 500);
    const r = { ok: true, brand: String(x.brand || "").slice(0, 80), name: String(x.name || "").slice(0, 120), kcal: null, how: "" };
    for (const q of ["p", "f", "fi", "a", "u"]) r[q] = n(x[q]);
    let k = n(x.kcal); if (k && k > 1000) k = k / 10;
    if (k && k > 200 && k < 700) { r.kcal = Math.round(k); r.how = "sacco"; }
    else if (n(x.p) != null && n(x.f) != null && n(x.a) != null) {
      const u = n(x.u) == null ? 10 : n(x.u), nfe = Math.max(0, 100 - n(x.p) - n(x.f) - (n(x.fi) || 0) - n(x.a) - u);
      r.kcal = Math.round(3.5 * n(x.p) + 8.5 * n(x.f) + 3.5 * nfe); r.how = "componenti";
    } else if (r.brand || r.name) {
      const w = await claude(env, `Cerca in internet l'energia metabolizzabile di queste crocchette per cani: "${(r.brand + " " + r.name).trim()}". Preferisci il produttore o negozi seri, versione europea.
Formato: {"kcal":null,"url":""} con kcal per 100 g (3850 kcal/kg = 385). Se non trovi niente di affidabile, kcal null. Non inventare.`,
        [{ type: "text", text: r.brand + " " + r.name }], 1200, [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]);
      let wk = n(w.kcal); if (wk && wk > 1000) wk = wk / 10;
      if (wk && wk > 200 && wk < 700) { r.kcal = Math.round(wk); r.how = "web"; r.url = String(w.url || "").slice(0, 300); }
    }
    return json(r, 200, H);
  } catch (e) { return json({ ok: false, error: "lettura non riuscita" }, 200, H); }
}
