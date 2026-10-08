import { json, isAdmin, deny, ensureContracts, can } from "../_lib.js";

// Per Paolo: tutti i contratti firmati dai proprietari
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, "proprietari", 1))) return deny();
  await ensureContracts(env);
  const { results } = await env.DB.prepare("SELECT dog, json FROM contracts").all();
  const out = {};
  (results || []).forEach(r => { out[r.dog] = JSON.parse(r.json); });
  return json(out);
}
