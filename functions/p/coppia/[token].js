// /p/coppia/<link segreto>  ->  pagina condivisa di una coppia (test mating). /p è fuori da Cloudflare Access.
export async function onRequestGet({ request, env }) {
  const r = await env.ASSETS.fetch(new URL("/coppia", request.url));
  const h = new Headers(r.headers); h.set("x-robots-tag", "noindex"); h.set("cache-control", "no-store");
  return new Response(r.body, { status: r.status, headers: h });
}
