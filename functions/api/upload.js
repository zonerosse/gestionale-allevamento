import { json, isAdmin, deny } from "../_lib.js";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "application/pdf": "pdf" };

// Carica una foto o un PDF nell'archivio file (R2)
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  const ct = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!EXT[ct]) return json({ error: "Tipo di file non accettato: " + ct }, 415);
  const size = +(request.headers.get("content-length") || 0);
  if (size > 25 * 1024 * 1024) return json({ error: "File troppo grande (max 25 MB)" }, 413);
  const key = crypto.randomUUID().replace(/-/g, "").slice(0, 20) + "." + EXT[ct];
  await env.FILES.put(key, await request.arrayBuffer(), { httpMetadata: { contentType: ct } });
  return json({ url: "/files/" + key });
}
