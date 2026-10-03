import { loadData, siteLitters } from "../../../../_lib.js";

// Foto dei genitori delle cucciolate "Sul sito": solo quelle, nient'altro.
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env);
  const ok = new Set(siteLitters(cur && cur.data).flatMap(l => [l.dam, l.sire]).filter(Boolean).map(p => p.photoKey).filter(Boolean));
  if (!ok.has(params.key)) return new Response("Non disponibile", { status: 404 });
  const obj = await env.FILES.get(params.key);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
}
