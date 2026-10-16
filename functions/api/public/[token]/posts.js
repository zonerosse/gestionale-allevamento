import { json, loadData, ownerSubset, ensureOwnerPosts, OWP_TYPES, OWP_KEY, owpRow } from "../../../_lib.js";

// Il proprietario scrive sulla scheda del suo cane (16/10/2026): solo i suoi cani, solo se Paolo ha acceso "Il proprietario può scrivere" (d.ownW).
// GET: le sue cose; POST: aggiunge; DELETE ?id=: toglie solo le sue.
const H = { "x-robots-tag": "noindex" };
const str = (v, n) => String(v == null ? "" : v).slice(0, n).trim();

async function ctx(env, token) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, token);
  if (!sub) return null;
  await ensureOwnerPosts(env);
  return { sub, dogs: cur.data.dogs, writable: sub.dogs.filter(k => cur.data.dogs[k] && cur.data.dogs[k].ownW) };
}

export async function onRequestGet({ env, params }) {
  const c = await ctx(env, params.token); if (!c) return json({ error: "Link non valido" }, 404, H);
  const r = await env.DB.prepare("SELECT * FROM ownerposts WHERE owner = ? ORDER BY created DESC").bind(c.sub.oid).all();
  const base = "/api/public/" + params.token + "/f/";
  return json({ writable: c.writable, items: (r.results || []).filter(x => c.sub.dogs.includes(x.dog)).map(x => owpRow(x, base)) }, 200, H);
}

export async function onRequestPost({ request, env, params }) {
  const c = await ctx(env, params.token); if (!c) return json({ error: "Link non valido" }, 404, H);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Dati non validi" }, 400, H); }
  if (!b || !c.writable.includes(b.dog)) return json({ error: "Su questo cane non puoi scrivere" }, 403, H);
  if (!OWP_TYPES.includes(b.type)) return json({ error: "Tipo non valido" }, 400, H);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM ownerposts WHERE owner = ?").bind(c.sub.oid).first();
  if (n && n.n >= 1000) return json({ error: "Troppe voci" }, 429, H);
  const files = [];
  for (const f of (Array.isArray(b.files) ? b.files : []).slice(0, 12)) {
    const key = str(f && f.key, 40);
    if (!OWP_KEY.test(key)) continue;
    const h = await env.FILES.head(key);
    if (!h || (h.customMetadata || {}).owner !== c.sub.oid) continue;
    files.push({ key, type: h.httpMetadata?.contentType || "", name: str(f.name, 120) });
  }
  const x = { type: b.type, date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : new Date().toISOString().slice(0, 10), kg: str(b.kg, 10), name: str(b.name, 160), vet: str(b.vet, 120),
    place: str(b.place, 160), judge: str(b.judge, 120), result: str(b.result, 200), note: str(b.note, 1500), files };
  if (["foto", "ref"].includes(b.type) && !files.length) return json({ error: "Manca il file" }, 400, H);
  const id = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 16), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO ownerposts (id, dog, owner, json, created, seen) VALUES (?, ?, ?, ?, ?, 0)").bind(id, b.dog, c.sub.oid, JSON.stringify(x), now).run();
  return json({ ok: true, id }, 200, H);
}

export async function onRequestDelete({ request, env, params }) {
  const c = await ctx(env, params.token); if (!c) return json({ error: "Link non valido" }, 404, H);
  const id = new URL(request.url).searchParams.get("id") || "";
  const r = await env.DB.prepare("SELECT * FROM ownerposts WHERE id = ? AND owner = ?").bind(id, c.sub.oid).first();
  if (!r) return json({ error: "Non trovato" }, 404, H);
  await env.DB.prepare("DELETE FROM ownerposts WHERE id = ?").bind(id).run();
  try { for (const f of (JSON.parse(r.json).files || [])) if (OWP_KEY.test(f.key)) await env.FILES.delete(f.key); } catch (e) {}
  return json({ ok: true }, 200, H);
}
