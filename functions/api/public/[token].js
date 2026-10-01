import { json, loadData, ownerSubset } from "../../_lib.js";

// Dati della pagina privata del proprietario (senza login: vale il link segreto)
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub) return json({ error: "Link non valido" }, 404, { "x-robots-tag": "noindex" });
  return json({ dogs: sub.dogs, owner: sub.oid, data: sub.data }, 200, { "x-robots-tag": "noindex" });
}
