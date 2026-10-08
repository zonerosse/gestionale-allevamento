import { loadData, ownerSubset, farmOf } from "../../../_lib.js";

// File del calendario (.ics) con le scadenze del primo anno di un cucciolo, per il telefono del proprietario.
// Stessa logica di calEvents() nella pagina: richiamo a 3 mesi, 1° aprile (stagione a rischio), richiamo a 1 anno,
// più le "prossime dosi" inserite da Paolo (vaccini, pulci e zecche, leishmania e filaria) che cadono nel primo anno.
const LFK = { ple: ["Prevenzione leishmania", "Leishmania prevention"], pfi: ["Prevenzione filaria", "Heartworm prevention"], vle: ["Vaccino leishmania", "Leishmania vaccine"], test: ["Test", "Test"] };
function events(d) {
  const h = d.health || {}; if (!d.birth) return [];
  const b = new Date(d.birth + "T12:00:00Z"), end = new Date(b); end.setUTCFullYear(end.getUTCFullYear() + 1); end.setUTCDate(end.getUTCDate() + 1);
  const iso = x => x.toISOString().slice(0, 10), add = m => { const x = new Date(b); x.setUTCMonth(x.getUTCMonth() + m); return iso(x); }, ev = [];
  const own = []; ["vacc", "pz", "lf"].forEach(k => (h[k] || []).forEach((v, i) => { if (v.next) own.push({ k, date: v.next, v, i }); }));
  const near = (dt, k) => own.some(o => o.k === k && Math.abs(new Date(o.date) - new Date(dt)) < 864e5 * 21);
  const m3 = add(3), y1 = add(12); let apr = new Date(Date.UTC(b.getUTCFullYear(), 3, 1, 12)); if (apr <= b) apr.setUTCFullYear(apr.getUTCFullYear() + 1);
  if (!near(m3, "vacc")) ev.push({ id: "m3", date: m3, t: ["Richiamo del vaccino", "Vaccine booster"], s: ["3 mesi", "3 months"] });
  if (apr < end) ev.push({ id: "apr", date: iso(apr), t: ["Inizia la stagione a rischio", "Risk season begins"], s: ["Aprile–ottobre: pulci, zecche, zanzare e pappataci. Chiedi al tuo veterinario la protezione per filaria e leishmania.", "April–October: fleas, ticks, mosquitoes and sandflies. Ask your vet about heartworm and leishmania protection."] });
  if (!near(y1, "vacc")) ev.push({ id: "y1", date: y1, t: ["Richiamo annuale del vaccino", "Annual vaccine booster"], s: ["1 anno", "1 year"] });
  own.forEach(o => { if (new Date(o.date) > end) return; const p = o.v.prod || "", pe = o.v.prod_en || p;
    const t = o.k === "vacc" ? ["Richiamo del vaccino", "Vaccine booster"] : o.k === "pz" ? ["Pulci e zecche: prossima dose", "Fleas and ticks: next dose"] : [(LFK[o.v.kind] || ["Leishmania e filaria"])[0] + ": prossima volta", (LFK[o.v.kind] || [0, "Leishmania and heartworm"])[1] + ": next time"];
    ev.push({ id: o.k + o.i, date: o.date, t, s: [p, pe] }); });
  const today = new Date().toISOString().slice(0, 10);
  return ev.filter(e => e.date >= today).sort((a, c) => a.date.localeCompare(c.date));
}
const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = l => { const out = []; let s = l; while (new TextEncoder().encode(s).length > 73) { let n = 73; while (new TextEncoder().encode(s.slice(0, n)).length > 73) n--; out.push(s.slice(0, n)); s = " " + s.slice(n); } out.push(s); return out.join("\r\n"); };

export async function onRequestGet({ env, params, request }) {
  const cur = await loadData(env);
  const sub = cur && ownerSubset(cur.data, params.token);
  const id = new URL(request.url).searchParams.get("dog");
  if (!sub || !sub.dogs.includes(id)) return new Response("Link non valido", { status: 404 });
  const d = cur.data.dogs[id], L = (cur.data.owners[sub.oid] || {}).lang === "en" ? 1 : 0, nm = d.nick || d.name;
  const F = farmOf(cur.data), stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + farmOf(cur.data).name + "//Gestionale//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc((L ? "Reminders · " : "Scadenze · ") + nm)];
  for (const e of events(d)) {
    const s = e.date.replace(/-/g, ""), x = new Date(e.date + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${id}-${e.id}@delpiccolodiavolo.it`, "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + s, "DTEND;VALUE=DATE:" + x.toISOString().slice(0, 10).replace(/-/g, ""),
      "SUMMARY:" + esc(e.t[L] + " · " + nm), "DESCRIPTION:" + esc(e.s[L] + (L ? "\n" + F.kennelEn + " · " + F.phoneIntl : "\n" + F.kennel + " · " + F.phone)),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(e.t[L]), "TRIGGER:-PT15H", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(e.t[L]), "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const file = (L ? "reminders-" : "scadenze-") + String(nm).toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".ics";
  return new Response(lines.map(fold).join("\r\n") + "\r\n", { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `inline; filename="${file}"`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
