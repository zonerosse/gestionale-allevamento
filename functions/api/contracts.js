import { json, isAdmin, deny, ensureContracts } from "../_lib.js";

// Per Paolo: tutti i contratti firmati dai proprietari
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  await ensureContracts(env);
  const { results } = await env.DB.prepare("SELECT dog, json FROM contracts").all();
  const out = {};
  (results || []).forEach(r => { out[r.dog] = JSON.parse(r.json); });
  return json(out);
}
