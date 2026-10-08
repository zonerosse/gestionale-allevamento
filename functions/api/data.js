import { json, isAdmin, deny, loadData, who, dailyCopy, limitedData, mergeLimited } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const w = await who(request, env), r = w.role;
  if (!r) return deny();
  const cur = await loadData(env);
  // permessi per sezione (08/10/2026): la persona riceve solo quello che può vedere, e il suo elenco di permessi
  if (r === "limited") return json(cur ? { version: cur.version, updated: cur.updated, data: limitedData(cur.data, w.perm), role: r, perm: w.perm } : { version: 0, data: null, role: r, perm: w.perm });
  return json(Object.assign(cur || { version: 0, data: null }, { role: r }));
}

// Salva tutto il gestionale. Ogni salvataggio resta anche nello storico (ultimi 200).
export async function onRequestPut({ request, env }) {
  const w = await who(request, env), rr = w.role;
  if (rr !== "admin" && !(rr === "limited" && Object.values(w.perm).some(x => x === 2))) return deny();
  const body = await request.json();
  if (!body || !body.data || !body.data.dogs) return json({ error: "Dati non validi" }, 400);
  if (rr === "limited") { // si salvano solo le sezioni che la persona può modificare, unite ai dati veri
    const cur0 = await loadData(env); if (!cur0) return deny();
    if (body.version !== cur0.version) return json({ error: "conflict", version: cur0.version }, 409);
    body.data = mergeLimited(cur0.data, body.data, w.perm);
  }
  const txt = JSON.stringify(body.data);
  if (txt.includes('"data:')) return json({ error: "Ci sono file non ancora caricati" }, 400);
  const now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT version, json FROM store WHERE id = 'main'").first();
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
  // copia automatica del giorno (punto 11): al primo salvataggio di ogni giorno si mette da parte com'era il gestionale
  // PRIMA di quel salvataggio (cioè alla fine dell'ultima volta che è stato usato); si tengono 90 giorni
  if (row) try { await dailyCopy(env, JSON.parse(row.json), row.json, now, row.version); } catch (e) {}
  return json({ version: nv, updated: now });
}
