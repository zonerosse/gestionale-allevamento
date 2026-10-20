import { json, can, deny, ensureFirme } from "../_lib.js";

// Le firme a distanza arrivate (20/10/2026): il gestionale le legge e mette il PDF firmato nella scheda del cane.
export async function onRequestGet({ request, env }) {
  if (!(await can(request, env, "anagrafe", 1))) return deny();
  await ensureFirme(env);
  const r = await env.DB.prepare("SELECT tok, dog, json, signed_at FROM firme ORDER BY signed_at DESC LIMIT 500").all();
  return json({ items: (r.results || []).map(x => { let j = {}; try { j = JSON.parse(x.json); } catch (e) {}
    return { tok: x.tok, dog: x.dog, at: x.signed_at, name: j.name || "", file: j.key ? "/files/" + j.key : "", hash: j.hash || "" }; }) });
}
