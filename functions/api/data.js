import { json, isAdmin, deny, loadData, role, viewerData } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const r = await role(request, env);
  if (!r) return deny();
  const cur = await loadData(env);
  if (r === "viewer") return json(cur ? { version: cur.version, updated: cur.updated, data: viewerData(cur.data), role: r } : { version: 0, data: null, role: r });
  return json(Object.assign(cur || { version: 0, data: null }, { role: r }));
}

// Salva tutto il gestionale. Ogni salvataggio resta anche nello storico (ultimi 200).
export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  const body = await request.json();
  if (!body || !body.data || !body.data.dogs) return json({ error: "Dati non validi" }, 400);
  const txt = JSON.stringify(body.data);
  if (txt.includes('"data:')) return json({ error: "Ci sono file non ancora caricati" }, 400);
  const now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT version FROM store WHERE id = 'main'").first();
  let nv;
  if (!row) {
    if (body.version !== 0) return json({ error: "conflict", version: 0 }, 409);
    nv = 1;
    await env.DB.prepare("INSERT INTO store (id, version, json, updated) VALUES ('main', ?, ?, ?)").bind(nv, txt, now).run();
  } else {
    if (body.version !== row.version) return json({ error: "conflict", version: row.version }, 409);
    nv = row.version + 1;
    const r = await env.DB.prepare("UPDATE store SET version = ?, json = ?, updated = ? WHERE id = 'main' AND version = ?").bind(nv, txt, now, row.version).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "conflict" }, 409);
  }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO history (at, version, json) VALUES (?, ?, ?)").bind(now, nv, txt),
    env.DB.prepare("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 200)")
  ]);
  return json({ version: nv, updated: now });
}
