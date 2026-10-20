// /p/firma/<link segreto>  ->  pagina per firmare un documento col dito (attestato dell'anagrafe, 20/10/2026)
export async function onRequestGet({ request, env }) {
  const r = await env.ASSETS.fetch(new URL("/firma", request.url));
  const h = new Headers(r.headers); h.set("x-robots-tag", "noindex"); h.set("cache-control", "no-store");
  return new Response(r.body, { status: r.status, headers: h });
}
