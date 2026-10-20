import { loadData, firmaFind } from "../../../../_lib.js";

// Il documento originale da firmare (solo con il link segreto della firma).
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env), F = cur && firmaFind(cur.data, params.tok);
  if (!F || !F.key) return new Response("Documento non disponibile", { status: 404 });
  const obj = await env.FILES.get(F.key);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/pdf", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
