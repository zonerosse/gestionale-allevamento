import { json, who, can, deny, ensureOwnerPosts, owpRow, OWP_KEY } from "../_lib.js";

// Paolo vede e cancella quello che i proprietari hanno scritto sulle schede dei cani (16/10/2026).
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, ["cani", "proprietari", "oggi"], 1))) return deny();
  await ensureOwnerPosts(env);
  const r = await env.DB.prepare("SELECT * FROM ownerposts ORDER BY created DESC LIMIT 2000").all();
  return json({ items: (r.results || []).map(x => owpRow(x, "/files/")) });
}
// { seen: [id…] } → segnate come viste
export async function onRequestPost({ request, env }) {
  const w = await who(request, env); if (w.role !== "admin") return deny();
  await ensureOwnerPosts(env);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Dati non validi" }, 400); }
  for (const id of (Array.isArray(b && b.seen) ? b.seen : []).slice(0, 500)) await env.DB.prepare("UPDATE ownerposts SET seen = 1 WHERE id = ?").bind(String(id)).run();
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  const w = await who(request, env); if (w.role !== "admin") return deny();
  await ensureOwnerPosts(env);
  const id = new URL(request.url).searchParams.get("id") || "";
  const r = await env.DB.prepare("SELECT json FROM ownerposts WHERE id = ?").bind(id).first();
  if (!r) return json({ error: "Non trovato" }, 404);
  await env.DB.prepare("DELETE FROM ownerposts WHERE id = ?").bind(id).run();
  try { for (const f of (JSON.parse(r.json).files || [])) if (OWP_KEY.test(f.key)) await env.FILES.delete(f.key); } catch (e) {}
  return json({ ok: true });
}
