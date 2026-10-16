import { loadData, ownerSubset, farmOf } from "../../../_lib.js";

// Manifest della pagina del proprietario (16/10/2026): l'icona sulla schermata Home porta il nome del cane e apre /p/<token>.
export async function onRequestGet({ env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub) return new Response("Non disponibile", { status: 404 });
  const D = cur.data, d = sub.dogs.length === 1 ? D.dogs[sub.dogs[0]] : null, farm = farmOf(D).name || "Del Piccolo Diavolo";
  const nm = d ? (d.nick || d.name || farm) : farm, en = (D.owners[sub.oid] || {}).lang === "en";
  const m = { name: d ? nm + " · " + farm : farm, short_name: nm.slice(0, 24), description: en ? "Your dog's page" : "La pagina del tuo cane",
    lang: en ? "en" : "it", id: "/p/" + params.token, start_url: "/p/" + params.token, scope: "/p/" + params.token, display: "standalone",
    background_color: "#FFFFFF", theme_color: "#ECEEF1",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
  return new Response(JSON.stringify(m), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache", "x-robots-tag": "noindex" } });
}
