import { json, who, deny } from "../_lib.js";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

// Carica una foto o un PDF nell'archivio file (R2)
export async function onRequestPost({ request, env }) {
  const w = await who(request, env); if (w.role !== "admin" && !(w.role === "limited" && Object.values(w.perm).some(x => x === 2))) return deny(); // chi può modificare almeno una sezione (es. ricevute dei Conti)
  const ct = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!EXT[ct]) return json({ error: "Tipo di file non accettato: " + ct }, 415);
  const size = +(request.headers.get("content-length") || 0);
  const vid = ct.startsWith("video/"); // video dei post Google (13/10/2026): già preparati nel telefono, Google accetta fino a 75 MB
  if (size > (vid ? 80 : 25) * 1024 * 1024) return json({ error: "File troppo grande (max " + (vid ? 80 : 25) + " MB)" }, 413);
  const key = crypto.randomUUID().replace(/-/g, "").slice(0, 20) + "." + EXT[ct];
  await env.FILES.put(key, await request.arrayBuffer(), { httpMetadata: { contentType: ct } });
  return json({ url: "/files/" + key });
}
