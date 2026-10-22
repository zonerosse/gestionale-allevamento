import { loadData, adFind, adWho } from "../../../../../_lib.js";
// Foto della pagina «pubblicità» di una cucciolata: solo genitori e nonni di QUELLA cucciolata (s, d, ss, sd, ds, dd).
export async function onRequestGet({ env, params }) {
  if (!["s", "d", "ss", "sd", "ds", "dd"].includes(params.who)) return new Response("Non disponibile", { status: 404 });
  const cur = await loadData(env), D = cur && cur.data, hit = adFind(D, params.token);
  if (!hit) return new Response("Non disponibile", { status: 404 });
  const dog = (D.dogs || {})[adWho(D, hit[1], params.who)] || {};
  const k = /\/files\/([A-Za-z0-9._-]+)/.exec(dog.photo || "");
  if (!k) return new Response("Nessuna foto", { status: 404 });
  const obj = await env.FILES.get(k[1]);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" } });
}
