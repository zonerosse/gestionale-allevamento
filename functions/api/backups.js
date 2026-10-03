import { json, isAdmin, deny, ensureDaily, dailyCopy } from "../_lib.js";

// Copie di sicurezza automatiche (punto 11) — solo Paolo.
// GET  /api/backups            → elenco (giorno, ora, quanti cani e cucciolate)
// GET  /api/backups?day=…      → la copia completa, da scaricare
// POST /api/backups {day}      → ripristina: prima mette da parte la situazione attuale ("prima del ripristino")
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  await ensureDaily(env);
  const day = new URL(request.url).searchParams.get("day");
  if (day) {
    const r = await env.DB.prepare("SELECT day, at, version, json FROM daily WHERE day = ?").bind(day).first();
    if (!r) return json({ error: "Copia non trovata" }, 404);
    return json({ tipo: "copia di sicurezza del gestionale Del Piccolo Diavolo", at: r.at, version: r.version, data: JSON.parse(r.json) });
  }
  const { results } = await env.DB.prepare("SELECT day, at, dogs, litters, note FROM daily ORDER BY at DESC").all();
  return json({ items: results || [] });
}
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  await ensureDaily(env);
  const { day } = await request.json().catch(() => ({}));
  const b = day && await env.DB.prepare("SELECT json FROM daily WHERE day = ?").bind(day).first();
  if (!b) return json({ error: "Copia non trovata" }, 404);
  const cur = await env.DB.prepare("SELECT version, json FROM store WHERE id = 'main'").first();
  const now = new Date().toISOString(), nv = (cur ? cur.version : 0) + 1;
  if (cur) await dailyCopy(env, JSON.parse(cur.json), cur.json, now, cur.version, "prima del ripristino");
  if (cur) await env.DB.prepare("UPDATE store SET version = ?, json = ?, updated = ? WHERE id = 'main'").bind(nv, b.json, now).run();
  else await env.DB.prepare("INSERT INTO store (id, version, json, updated) VALUES ('main', ?, ?, ?)").bind(nv, b.json, now).run();
  await env.DB.prepare("INSERT INTO history (at, version, json) VALUES (?, ?, ?)").bind(now, nv, b.json).run();
  return json({ ok: true, version: nv });
}
