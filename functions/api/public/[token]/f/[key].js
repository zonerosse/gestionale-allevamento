import { loadData, ownerSubset } from "../../../../_lib.js";

// File (foto, referti) visibili al proprietario: solo quelli che compaiono nella sua pagina, più quelli che ha caricato lui
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub) return new Response("Non disponibile", { status: 404 });
  const obj = await env.FILES.get(params.key);
  // anche i file caricati da lui (foto, video, referti: metadato owner, 16/10/2026)
  if (!sub.allowed.has(params.key) && !(obj && (obj.customMetadata || {}).owner === sub.oid)) return new Response("Non disponibile", { status: 404 });
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=3600", "x-robots-tag": "noindex" } });
}
