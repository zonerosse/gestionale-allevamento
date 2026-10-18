import { json, who, deny } from "../_lib.js";
import { ensureCrocchette, croKey } from "./public/crocchette.js";

// Paolo vede le crocchette proposte dagli utenti (accettate e scartate da Claude), le toglie o le rimette (18/10/2026).
export async function onRequestGet({ request, env }) {
  const w = await who(request, env); if (!w.role) return deny();
  await ensureCrocchette(env);
  const r = await env.DB.prepare("SELECT id, brand, name, name_en, kcal, comp, status, reason, url, src, sent, origin, created FROM crocchette ORDER BY created DESC LIMIT 1000").all();
  return json({ items: r.results || [] });
}
// { del: id } → tolta dall'elenco comune (non torna più con lo stesso nome); { ok: id } → messa nell'elenco comune
export async function onRequestPost({ request, env }) {
  const w = await who(request, env); if (w.role !== "admin") return deny();
  await ensureCrocchette(env);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Dati non validi" }, 400); }
  if (b.del) await env.DB.prepare("UPDATE crocchette SET status = 'del' WHERE id = ?").bind(String(b.del)).run();
  if (b.ok) { const x = await env.DB.prepare("SELECT brand, name FROM crocchette WHERE id = ?").bind(String(b.ok)).first();
    if (x) await env.DB.prepare("UPDATE crocchette SET status = 'ok', k = ? WHERE id = ?").bind(croKey(x.brand, x.name), String(b.ok)).run(); }
  return json({ ok: true });
}
