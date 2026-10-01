import { json, isAdmin, deny, loadData } from "../_lib.js";
const OK = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "application/pdf"];

// Primo avvio: carica nel gestionale online il file "dati-iniziali-gestionale.json"
// scelto dal PC (i dati non stanno mai in una cartella pubblica).
// POST /api/import?file=nome  (corpo: il file)  -> salva foto o PDF nell'archivio
// POST /api/import            (corpo: i dati)   -> scrive i dati, solo se il database è vuoto
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  const url = new URL(request.url), f = url.searchParams.get("file");
  if (f) {
    if (!/^[a-f0-9]{20}\.[a-z]{3,4}$/.test(f)) return json({ error: "Nome non valido" }, 400);
    const ct = (request.headers.get("content-type") || "").split(";")[0];
    if (!OK.includes(ct)) return json({ error: "Tipo non accettato" }, 415);
    if (!(await env.FILES.head(f))) await env.FILES.put(f, await request.arrayBuffer(), { httpMetadata: { contentType: ct } });
    return json({ ok: true });
  }
  if (await loadData(env)) return json({ error: "Il database contiene già dei dati" }, 409);
  const data = await request.json();
  if (!data || !data.dogs || !data.owners) return json({ error: "Dati non validi" }, 400);
  const txt = JSON.stringify(data), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO store (id, version, json, updated) VALUES ('main', 1, ?, ?)").bind(txt, now).run();
  await env.DB.prepare("INSERT INTO history (at, version, json) VALUES (?, 1, ?)").bind(now, txt).run();
  return json({ ok: true, version: 1 });
}
