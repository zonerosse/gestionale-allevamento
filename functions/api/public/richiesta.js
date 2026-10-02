import { ensureRequests } from "../../_lib.js";

// Richiesta di prenotazione dal modulo del sito delpiccolodiavolo.it: va nella Lista d'attesa del gestionale.
// Può solo AGGIUNGERE una richiesta: non legge e non cambia nient'altro.
const s = (v, n = 300) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").slice(0, n).trim();
export async function onRequestPost({ request, env }) {
  const ok = new Response("ok", { headers: { "content-type": "text/plain", "access-control-allow-origin": "*" } });
  let p = {};
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) p = await request.json();
    else { const f = await request.formData(); for (const [k, v] of f.entries()) p[k] = String(v); }
  } catch (e) { return ok; }
  if (p.azienda) return ok;                        // trucco anti-spam del modulo
  const r = { name: s(p.nome, 120), email: s(p.email, 160), phone: s(p.telefono, 60), city: s(p.citta, 120), country: s(p.nazione, 80),
    sex: s(p.sesso, 120), exp: s(p.esperienza, 160), note: s(p.note, 3000), page: s(p.pagina, 300) };
  if (r.name.length < 2 || (!r.email && !r.phone)) return ok;
  await ensureRequests(env);
  const id = "r" + crypto.randomUUID().replace(/-/g, "").slice(0, 12), at = new Date().toISOString();
  await env.DB.prepare("INSERT INTO requests (id, json, created) VALUES (?, ?, ?)").bind(id, JSON.stringify(r), at).run();
  return ok;
}
export async function onRequestOptions() {
  return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } });
}
