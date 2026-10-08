import { json, isAdmin, deny, ensureRequests, can } from "../_lib.js";

// Per Paolo: le richieste arrivate dal modulo del sito (il gestionale le aggiunge alla Lista d'attesa)
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, "attesa", 1))) return deny();
  await ensureRequests(env);
  const { results } = await env.DB.prepare("SELECT id, json, created FROM requests ORDER BY created").all();
  return json((results || []).map(r => Object.assign(JSON.parse(r.json), { rid: r.id, created: r.created })));
}
// Per Paolo: quando elimina una richiesta del sito dalla Lista d'attesa, si toglie anche da qui, così non torna (06/10/2026)
export async function onRequestDelete({ request, env }) {
  if (!(await can(request, env, "attesa", 2))) return deny();
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^r[0-9a-f]{12}$/.test(id)) return json({ ok: false, error: "id non valido" }, 400);
  await ensureRequests(env);
  await env.DB.prepare("DELETE FROM requests WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
