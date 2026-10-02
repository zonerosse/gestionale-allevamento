import { json, isAdmin, deny, ensureRequests } from "../_lib.js";

// Per Paolo: le richieste arrivate dal modulo del sito (il gestionale le aggiunge alla Lista d'attesa)
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  await ensureRequests(env);
  const { results } = await env.DB.prepare("SELECT id, json, created FROM requests ORDER BY created").all();
  return json((results || []).map(r => Object.assign(JSON.parse(r.json), { rid: r.id, created: r.created })));
}
