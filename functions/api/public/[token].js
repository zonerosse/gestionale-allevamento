import { json, loadData, ownerSubset, ensureContracts } from "../../_lib.js";

// Dati della pagina privata del proprietario (senza login: vale il link segreto)
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub) return json({ error: "Link non valido" }, 404, { "x-robots-tag": "noindex" });
  // contratti già firmati per i suoi cani (senza IP e browser)
  try {
    await ensureContracts(env);
    for (const id of sub.dogs) {
      const r = await env.DB.prepare("SELECT json FROM contracts WHERE dog = ?").bind(id).first();
      if (r && sub.data.dogs[id]) { const x = JSON.parse(r.json); delete x.ip; delete x.ua; delete x.meSig; sub.data.dogs[id].ctSigned = x; }
    }
  } catch (e) {}
  return json({ dogs: sub.dogs, owner: sub.oid, data: sub.data }, 200, { "x-robots-tag": "noindex" });
}
