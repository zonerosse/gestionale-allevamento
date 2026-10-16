import { json, loadData, ownerSubset } from "../../../_lib.js";

// Il proprietario carica una foto, un video o un referto per il suo cane (16/10/2026). Solo se Paolo ha acceso d.ownW.
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif", "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
export async function onRequestPost({ request, env, params }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  if (!sub) return json({ error: "Link non valido" }, 404);
  const dog = new URL(request.url).searchParams.get("dog") || "";
  if (!sub.dogs.includes(dog) || !(cur.data.dogs[dog] || {}).ownW) return json({ error: "Su questo cane non puoi scrivere" }, 403);
  const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!EXT[ct]) return json({ error: "Tipo di file non accettato" }, 415);
  const size = +(request.headers.get("content-length") || 0), vid = ct.startsWith("video/");
  if (size > (vid ? 80 : 25) * 1024 * 1024) return json({ error: "File troppo grande (max " + (vid ? 80 : 25) + " MB)" }, 413);
  const key = "o" + crypto.randomUUID().replace(/-/g, "").slice(0, 20) + "." + EXT[ct];
  await env.FILES.put(key, await request.arrayBuffer(), { httpMetadata: { contentType: ct }, customMetadata: { owner: sub.oid, dog } });
  return json({ ok: true, key, url: "/api/public/" + params.token + "/f/" + key });
}
