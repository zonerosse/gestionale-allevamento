import { loadData } from "../../../../../_lib.js";
// Foto dei due cani della pagina condivisa di una coppia (07/10/2026): solo madre ("dam") o padre ("sire") di QUEL link.
export async function onRequestGet({ env, params }) {
  if (!["sire", "dam"].includes(params.who)) return new Response("Non disponibile", { status: 404 });
  const cur = await loadData(env), D = cur && cur.data;
  const hit = D && Object.entries(D.matings || {}).find(([, m]) => m && m.share && m.share === params.token);
  if (!hit) return new Response("Non disponibile", { status: 404 });
  const [s, d] = hit[0].split("|"), dog = (D.dogs || {})[params.who === "sire" ? s : d] || {};
  const k = /\/files\/([A-Za-z0-9._-]+)/.exec(dog.photo || "");
  if (!k) return new Response("Nessuna foto", { status: 404 });
  const obj = await env.FILES.get(k[1]);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" } });
}
