import { loadData, ownerSubset } from "../../../../_lib.js";

// File (foto, referti) visibili al proprietario: solo quelli che compaiono nella sua pagina
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub || !sub.allowed.has(params.key)) return new Response("Non disponibile", { status: 404 });
  const obj = await env.FILES.get(params.key);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=3600", "x-robots-tag": "noindex" } });
}
