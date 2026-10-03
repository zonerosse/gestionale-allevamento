import { loadData } from "../../../../_lib.js";

// Una sola scadenza nel calendario del telefono (campanello 🔔 della pagina Scadenze).
// /api/public/scadenze/<settings.calToken>/ev?id=<id scadenza>&al=prima|giorno|tutte → file .ics con un evento e i suoi avvisi.
const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = l => { const o = []; let s = l; while (s.length > 74) { o.push(s.slice(0, 74)); s = " " + s.slice(74); } o.push(s); return o.join("\r\n"); };
export async function onRequestGet({ env, params, request }) {
  const q = new URL(request.url).searchParams, id = q.get("id") || "", al = q.get("al") || "prima";
  const cur = await loadData(env), st = (cur && cur.data && cur.data.settings) || {};
  if (!/^[A-Za-z0-9_-]{16,}$/.test(params.token || "") || params.token !== st.calToken) return new Response("Link non valido", { status: 404 });
  const e = (st.scad || []).find(x => x.id === id);
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) return new Response("Scadenza non trovata: riapri il gestionale e riprova.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z", d = e.date.replace(/-/g, ""), n = new Date(e.date + "T12:00:00Z"); n.setUTCDate(n.getUTCDate() + 1);
  const alarm = t => ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(e.t).slice(0, 60), "TRIGGER:" + t, "END:VALARM"];
  const A = al === "giorno" ? alarm("PT9H") : al === "tutte" ? [...alarm("-PT15H"), ...alarm("PT9H")] : alarm("-PT15H");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Del Piccolo Diavolo//Scadenza//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", fold("UID:" + esc(id) + "-singola@gestionale.delpiccolodiavolo.it"), "DTSTAMP:" + now, "DTSTART;VALUE=DATE:" + d,
    "DTEND;VALUE=DATE:" + n.toISOString().slice(0, 10).replace(/-/g, ""), fold("SUMMARY:" + esc(e.t)), fold("DESCRIPTION:" + esc(e.s)), ...A, "END:VEVENT", "END:VCALENDAR"];
  return new Response(L.join("\r\n") + "\r\n", { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="scadenza.ics"', "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
