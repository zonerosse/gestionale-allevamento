import { role, deny } from "../_lib.js";

export async function onRequestGet({ request, env, params }) {
  if (!(await role(request, env))) return deny();
  const obj = await env.FILES.get(params.key);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=86400", "x-robots-tag": "noindex" } });
}
