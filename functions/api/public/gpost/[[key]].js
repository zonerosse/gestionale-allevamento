import { gbpGet } from "../../../_gbp.js";
// Foto (e video, 13/10/2026) di un post su Google: Google li scarica da qui. Solo le chiavi registrate da api/posts.js, solo per 2 giorni.
// Per i video accetta anche le richieste "a pezzi" (Range), che alcuni lettori usano.
export async function onRequestGet({ request, env, params }) {
  const key = (Array.isArray(params.key) ? params.key : [params.key]).join("/");
  const exp = Number(await gbpGet(env, "media:" + key));
  if (!exp || exp < Date.now()) return new Response("Non disponibile", { status: 404 });
  const rg = request.headers.get("range");
  const obj = await env.FILES.get(key, rg ? { range: request.headers } : undefined);
  if (!obj) return new Response("File non trovato", { status: 404 });
  const h = { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "no-store", "accept-ranges": "bytes" };
  if (rg && obj.range) {
    const off = obj.range.offset ?? (obj.range.suffix != null ? obj.size - obj.range.suffix : 0);
    const len = obj.range.length ?? (obj.size - off);
    h["content-range"] = `bytes ${off}-${off + len - 1}/${obj.size}`; h["content-length"] = String(len);
    return new Response(obj.body, { status: 206, headers: h });
  }
  h["content-length"] = String(obj.size);
  return new Response(obj.body, { headers: h });
}
