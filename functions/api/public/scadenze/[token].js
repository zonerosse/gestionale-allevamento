import { loadData } from "../../../_lib.js";

// Calendario del telefono con le Scadenze di Paolo (iPhone: webcal://…, Google: "Da URL").
// Avviso: il giorno prima alle 9 (TRIGGER -PT15H); con e.al = ora del giorno stesso (conto alla rovescia del Modello B).
// Il link segreto è settings.calToken; l'elenco (settings.scad) lo prepara il gestionale a ogni salvataggio.
const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = l => { const o = []; let s = l; while (s.length > 74) { o.push(s.slice(0, 74)); s = " " + s.slice(74); } o.push(s); return o.join("\r\n"); };
export async function onRequestGet({ env, params }) {
  const tok = String(params.token || "").replace(/\.ics$/, "");
  const cur = await loadData(env), st = (cur && cur.data && cur.data.settings) || {};
  if (!/^[A-Za-z0-9_-]{16,}$/.test(tok) || tok !== st.calToken) return new Response("Link non valido", { status: 404 });
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Del Piccolo Diavolo//Scadenze//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Del Piccolo Diavolo – Scadenze", "X-WR-TIMEZONE:Europe/Rome", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of st.scad || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) continue;
    const d = e.date.replace(/-/g, ""), n = new Date(e.date + "T12:00:00Z"); n.setUTCDate(n.getUTCDate() + 1);
    L.push("BEGIN:VEVENT", fold("UID:" + esc(e.id) + "@gestionale.delpiccolodiavolo.it"), "DTSTAMP:" + now, "DTSTART;VALUE=DATE:" + d,
      "DTEND;VALUE=DATE:" + n.toISOString().slice(0, 10).replace(/-/g, ""), fold("SUMMARY:" + esc(e.t)), fold("DESCRIPTION:" + esc(e.s)), "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(e.t).slice(0, 60), e.al ? "TRIGGER:PT" + (+e.al || 9) + "H" : "TRIGGER:-PT15H", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return new Response(L.join("\r\n") + "\r\n", { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
