import { loadData, farmOf } from "../../../../_lib.js";

// Una sola scadenza nel calendario del telefono (campanello 🔔 della pagina Scadenze), con preavviso e ripetizione scelti da Paolo.
// /api/public/scadenze/<settings.calToken>/ev?id=<id>&pre=<giorni prima del primo avviso>&every=<ogni quanti giorni, 0 = una volta>
// → file .ics con un evento per ogni avviso (alle 9 di quel giorno) e la scadenza stessa; gli avvisi già passati non si mettono.
// (Vecchio formato &al=prima|giorno|tutte ancora accettato.)
const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = l => { const o = []; let s = l; while (s.length > 74) { o.push(s.slice(0, 74)); s = " " + s.slice(74); } o.push(s); return o.join("\r\n"); };
const addD = (s, n) => { const x = new Date(s + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export async function onRequestGet({ env, params, request }) {
  const q = new URL(request.url).searchParams, id = q.get("id") || "";
  const old = { prima: [1, 0], giorno: [0, 0], tutte: [1, 1] }[q.get("al") || ""];
  const pre = Math.max(0, Math.min(365, +(q.get("pre") ?? (old ? old[0] : 1)) || 0)), every = Math.max(0, Math.min(365, +(q.get("every") ?? (old ? old[1] : 0)) || 0));
  const cur = await loadData(env), st = (cur && cur.data && cur.data.settings) || {};
  if (!/^[A-Za-z0-9_-]{16,}$/.test(params.token || "") || params.token !== st.calToken) return new Response("Link non valido", { status: 404 });
  const e = (st.scad || []).find(x => x.id === id);
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) return new Response("Scadenza non trovata: riapri il gestionale e riprova.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z", today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const days = []; for (let k = pre; k > 0; k -= (every || pre + 1)) days.push([addD(e.date, -k), k]); days.push([e.date, 0]);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + farmOf(cur.data).name + "//Scadenza//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const [d, k] of days) {
    if (d < today && k) continue;
    const t = k ? "⏰ " + e.t.replace(/ · /, ": mancano " + k + " giorni · ") : e.t;
    L.push("BEGIN:VEVENT", fold("UID:" + esc(id) + "-singola-" + k + "@gestionale.delpiccolodiavolo.it"), "DTSTAMP:" + now, "DTSTART;VALUE=DATE:" + d.replace(/-/g, ""),
      "DTEND;VALUE=DATE:" + addD(d, 1).replace(/-/g, ""), fold("SUMMARY:" + esc(t)), fold("DESCRIPTION:" + esc((k ? "scade il " + e.date.split("-").reverse().join("/") + " · " : "") + e.s)),
      "TRANSP:TRANSPARENT", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(t).slice(0, 60), "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return new Response(L.join("\r\n") + "\r\n", { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="scadenza.ics"', "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
