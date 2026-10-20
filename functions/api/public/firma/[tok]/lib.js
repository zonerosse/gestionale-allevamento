// pdf-lib per la pagina della firma: il file statico del gestionale è dietro Cloudflare Access, questo indirizzo no.
export async function onRequestGet({ request, env }) {
  const r = await env.ASSETS.fetch(new URL("/pdf-lib.min.js", request.url));
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
