import { gbpGet } from "../../../_gbp.js";
// Foto di un post su Google: Google la scarica da qui. Solo le chiavi registrate da api/posts.js, solo per 2 giorni.
export async function onRequestGet({ env, params }) {
  const key = (Array.isArray(params.key) ? params.key : [params.key]).join("/");
  const exp = Number(await gbpGet(env, "media:" + key));
  if (!exp || exp < Date.now()) return new Response("Non disponibile", { status: 404 });
  const obj = await env.FILES.get(key);
  if (!obj) return new Response("File non trovato", { status: 404 });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "no-store" } });
}
