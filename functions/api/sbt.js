import { json, isAdmin, deny } from "../_lib.js";

// Prova a leggere da SBTpedigree i dati base di un cane (nome, nascita, sesso, genitori) dal suo numero.
// SBT può bloccare le letture automatiche: in quel caso risponde ok:false e il gestionale chiede solo il nome.
const dec = s => String(s || "").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).trim();
export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return deny();
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^\d{1,9}$/.test(id)) return json({ ok: false, error: "Numero SBT non valido" }, 400);
  let html = "";
  try {
    const r = await fetch("https://sbtpedigree.com/dog_details?dogs_id=" + id, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "accept": "text/html,application/xhtml+xml", "accept-language": "it-IT,it;q=0.9,en;q=0.8" }, cf: { cacheTtl: 0 } });
    if (!r.ok) return json({ ok: false, status: r.status });
    html = await r.text();
  } catch (e) { return json({ ok: false, error: "SBT non raggiungibile" }); }
  const meta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || "";
  const d = dec(meta);
  const m = d.match(/^(.*?) called '([^']*)' was born ([0-9-]+)\.\s*Sired by (.*?), out of (.*?)\./i);
  let name = m ? m[1] : dec((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").replace(/<[^>]+>/g, "").trim();
  if (!name) return json({ ok: false, error: "Pagina non riconosciuta" });
  const birth = m && /^\d{4}-\d{2}-\d{2}$/.test(m[3]) && !m[3].startsWith("0000") ? m[3] : "";
  const sex = /Sex\s*[:·]*\s*(?:<[^>]*>\s*)*·?\s*(Male|Female)/i.exec(html.replace(/\s+/g, " "));
  return json({ ok: true, id, name, nick: m ? m[2] : "", birth, sire: m ? m[4] : "", dam: m ? m[5] : "", sex: sex ? (sex[1].toLowerCase() === "female" ? "F" : "M") : "" });
}
