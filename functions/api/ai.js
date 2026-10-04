import { json, role, deny } from "../_lib.js";
/* Funzioni con Claude (ottobre 2026, scelte di Paolo). Chiave: segreto Cloudflare ANTHROPIC_API_KEY.
   POST { task, ... } → { ok, ... }. Solo l'admin (Paolo). Niente viene salvato o mandato da qui: il gestionale mostra il
   risultato e Paolo decide. Compiti:
   - "in":       { text }                  → { lang, langName, it }          messaggio ricevuto → italiano
   - "interessato": { msg, it }           → { name, city, country, sex, when, lang, note }  per la lista Interessati
   - "risposte": { msg, it, lang }         → { options:[{label,it,out}] }     tre risposte diverse, già tradotte
   - "out":      { text, lang }            → { text }                         italiano di Paolo → lingua del cliente
   - "richiesta":{ msg, name, lang? }      → { lang, langName, sunto, bozza, out }  richiesta dal sito
   - "testmating": { data, media, sire, dam } → { pair, single, coi8, coi3, coi5, uniq, loss, top } pagina di SBTpedigree
   - "referto":  { key | data, media, dog } → { title, title_en, date, lab, chip, tests:[{it,en,de}], note }
   Paolo non conosce inglese e tedesco: le traduzioni devono essere fedeli, naturali, senza aggiunte. */
const MODEL = "claude-sonnet-5-5";
const LANGS = { it: "italiano", en: "inglese", de: "tedesco", fr: "francese", es: "spagnolo", sl: "sloveno", hr: "croato", pl: "polacco", nl: "olandese", pt: "portoghese" };
const VOICE = `Scrivi come Paolo Boldrini, allevatore di Staffordshire Bull Terrier a Ostellato (Ferrara), allevamento Del Piccolo Diavolo, dal 2013.
Tono: diretto, cordiale, sobrio. Prima persona singolare. Niente titoli o palmarès dei cani ("non tirarsela"), niente parole vuote (passione, amore per la razza, professionalità), niente promesse, niente prezzi, niente pressione commerciale. Frasi brevi. Si firma "Paolo".`;
const ask = async (env, system, content, max = 1200) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: max, system: system + "\nRispondi SOLO con un oggetto JSON valido, senza altro testo.", messages: [{ role: "user", content }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || "errore";
    throw new Error(/credit|balance/i.test(m) ? "Credito di Claude finito: ricarica in console.anthropic.com → Billing." : "Claude " + r.status + ": " + m);
  }
  const t = (j.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
};
const b64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
export async function onRequestPost({ request, env }) {
  if ((await role(request, env)) !== "admin") return deny();
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "Manca la chiave ANTHROPIC_API_KEY in Cloudflare (Settings → Variables and Secrets)." });
  try {
    const p = await request.json(), task = p.task;
    if (task === "in") {
      const o = await ask(env, `Traduci in italiano un messaggio ricevuto da un allevatore di cani (WhatsApp o email). Traduzione fedele e naturale, senza aggiungere né togliere niente. Riconosci la lingua originale.
Formato: {"lang":"codice ISO 639-1","it":"traduzione italiana"}`, String(p.text || "").slice(0, 4000));
      return json({ ok: true, lang: o.lang || "en", langName: LANGS[o.lang] || o.lang, it: o.it || "" });
    }
    if (task === "out") {
      const L = LANGS[p.lang] ? p.lang : "en";
      const o = await ask(env, `Traduci in ${LANGS[L]} il messaggio scritto in italiano da Paolo, allevatore di cani, per un cliente o un allevatore straniero. Traduzione fedele e naturale, registro cordiale (in tedesco "Sie" se il testo dà del lei, altrimenti "du"; in inglese naturale e semplice). Non aggiungere saluti, frasi o informazioni che non ci sono. Mantieni a capo ed emoji.
Formato: {"text":"traduzione"}`, String(p.text || "").slice(0, 4000));
      return json({ ok: true, text: o.text || "" });
    }
    if (task === "risposte") {
      const L = LANGS[p.lang] ? p.lang : "en";
      const o = await ask(env, `${VOICE}
Ti arriva un messaggio (WhatsApp o email) da un cliente o un allevatore. Proponi 3 risposte DIVERSE nell'approccio, non solo nel tono (es. breve e cordiale / con le informazioni utili / che fissa il prossimo passo; scegli tu i tre approcci più adatti al messaggio).
Per ognuna: "label" (2-4 parole in italiano che dicono cosa fa), "it" (la risposta in italiano, massimo 60 parole, firmata "Paolo" solo se il messaggio ricevuto è lungo o formale), "out" (la stessa risposta tradotta fedelmente in ${LANGS[L]}).
Non inventare fatti su cani, date, prezzi o salute: se servono, scrivi una parentesi quadra da completare, es. [data].
Formato: {"options":[{"label":"","it":"","out":""}]}`,
        `Messaggio originale:\n${String(p.msg || "").slice(0, 3000)}\n\nTraduzione italiana:\n${String(p.it || "").slice(0, 3000)}`, 1800);
      return json({ ok: true, options: (o.options || []).slice(0, 3).map(x => ({ label: x.label || "", it: x.it || "", out: x.out || "" })) });
    }
    if (task === "interessato") {
      const o = await ask(env, `Da un messaggio WhatsApp di una persona interessata a un cucciolo di Staffordshire Bull Terrier, estrai SOLO quello che c'è scritto (stringa vuota se manca, non inventare):
"name" (nome con cui si firma o si presenta), "city", "country" (in italiano, es. "Slovenia"), "sex" ("maschio", "femmina" o ""), "when" (quando lo vorrebbe, es. "primavera 2027"), "lang" (codice ISO 639-1 della lingua del messaggio), "note" (in italiano, una frase con le domande o le richieste fatte).
Formato: {"name":"","city":"","country":"","sex":"","when":"","lang":"","note":""}`, `Messaggio:\n${String(p.msg || "").slice(0, 3000)}\n\nTraduzione italiana:\n${String(p.it || "").slice(0, 3000)}`, 600);
      return json({ ok: true, name: o.name || "", city: o.city || "", country: o.country || "", sex: o.sex || "", when: o.when || "", lang: o.lang || "it", note: o.note || "" });
    }
    if (task === "richiesta") {
      const o = await ask(env, `${VOICE}
Ti arriva una richiesta di informazioni dal modulo contatti del sito. Fai tre cose:
1) "sunto": riassunto in italiano, 1-2 frasi, con i dati utili (chi è, dove vive, cosa cerca, quando, domande fatte).
2) "bozza": risposta in italiano scritta da Paolo, breve (massimo 90 parole), che risponde solo alle domande fatte, senza inventare informazioni sull'allevamento, sui cuccioli o sulle date. Se servono dati che non conosci, lascia una parentesi quadra da completare, es. [data della prossima cucciolata].
3) "out": la stessa bozza tradotta nella lingua di chi ha scritto (se è italiano, uguale alla bozza).
Formato: {"lang":"codice ISO 639-1 di chi scrive","sunto":"...","bozza":"...","out":"..."}`,
        `Nome: ${p.name || ""}\nMessaggio:\n${String(p.msg || "").slice(0, 4000)}`, 1500);
      return json({ ok: true, lang: o.lang || "it", langName: LANGS[o.lang] || o.lang, sunto: o.sunto || "", bozza: o.bozza || "", out: o.out || "" });
    }
    if (task === "referto") {
      let data = p.data, media = p.media;
      if (p.key) { const obj = await env.FILES.get(String(p.key).replace(/^\/?files\//, "")); if (!obj) return json({ ok: false, error: "File non trovato." }); data = b64(await obj.arrayBuffer()); media = (obj.httpMetadata && obj.httpMetadata.contentType) || media; }
      if (!data) return json({ ok: false, error: "Manca il file." });
      data = String(data).replace(/^data:[^,]*,/, "");
      const doc = media === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: media || "image/jpeg", data } };
      const dog = p.dog || {};
      const o = await ask(env, `Leggi un referto veterinario o di laboratorio di un cane (test genetici, esami, vaccini, certificati). Estrai SOLO quello che c'è scritto, senza interpretare.
- "title": titolo breve in italiano per l'archivio (es. "Test genetici L2HGA e HC – Laboklin").
- "title_en": lo stesso in inglese.
- "date": data del referto (AAAA-MM-GG) o "".
- "lab": laboratorio o clinica, o "".
- "chip": numero di microchip scritto sul referto (solo cifre), o "".
- "tests": per ogni test genetico con risultato, una riga breve nelle tre lingue nello stile "L2HGA: esente (N/N)" / "L2HGA: clear (N/N)" / "L2HGA: frei (N/N)". Per portatori: "portatore (N/P)" / "carrier (N/P)" / "Träger (N/P)"; per affetti: "affetto (P/P)" / "affected (P/P)" / "betroffen (P/P)". Lista vuota se non ci sono test genetici.
- "note": una frase in italiano su cos'altro contiene (vaccino, esame, ecc.), o "".
Formato: {"title":"","title_en":"","date":"","lab":"","chip":"","tests":[{"it":"","en":"","de":""}],"note":""}`,
        [doc, { type: "text", text: `Cane atteso: ${dog.name || ""}, microchip ${dog.chip || "non indicato"}.` }], 1500);
      return json({ ok: true, title: o.title || "", title_en: o.title_en || "", date: o.date || "", lab: o.lab || "", chip: String(o.chip || "").replace(/\D/g, ""), tests: Array.isArray(o.tests) ? o.tests : [], note: o.note || "" });
    }
    if (task === "testmating") {
      const parts = (Array.isArray(p.parts) && p.parts.length ? p.parts : [p.data]).filter(Boolean).slice(0, 4).map(x => String(x).replace(/^data:[^,]*,/, "")), media = p.media || "image/jpeg";
      if (!parts.length) return json({ ok: false, error: "Manca il file." });
      const doc = media === "application/pdf" ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: parts[0] } }] : parts.map(d => ({ type: "image", source: { type: "base64", media_type: media, data: d } }));
      const o = await ask(env, `Leggi una pagina di SBTpedigree.com (Testmating COI o analisi di un cane). Estrai SOLO i numeri scritti, senza calcolare niente.
- "pair": i nomi della coppia come scritti (es. "Black Stone D.P. x Lackyle Bean Croi Olc"), o il nome del cane se è l'analisi di un cane solo.
- "single": true se è l'analisi di un cane solo e non di una coppia (test mating).
- "coi8","coi3","coi5": percentuali come numeri (es. 14.736), null se non ci sono.
- "uniq": antenati in 8 generazioni (es. 360), "loss": ancestor loss in % (es. 29.4), null se mancano.
- "blood": dalla tabella "Ancestor list (blood % and appearances by generation)", i 6 antenati con il Blood % più alto SENZA il padre e la madre (i due al 50%): [{"name":"","pct":43.75,"n":4,"gens":"2,4,4,4"}] dove "n" = # of appearances e "gens" = le generazioni in cui compare, ripetute per ogni comparsa. Lista vuota se la tabella non si vede.
- "top": "Most repeated ancestors" [{"name":"","n":14}], al massimo 3.
Formato: {"pair":"","single":false,"coi8":null,"coi3":null,"coi5":null,"uniq":null,"loss":null,"blood":[],"top":[]}`,
        [...doc, { type: "text", text: `Coppia scelta nel gestionale: maschio ${p.sire || ""}, femmina ${p.dam || ""}.${doc.length > 1 ? " Le immagini sono pezzi consecutivi della stessa pagina, dall'alto in basso." : ""}` }], 1400);
      return json({ ok: true, pair: o.pair || "", single: !!o.single, coi8: o.coi8, coi3: o.coi3, coi5: o.coi5, uniq: o.uniq, loss: o.loss, blood: Array.isArray(o.blood) ? o.blood.slice(0, 6) : [], top: Array.isArray(o.top) ? o.top.slice(0, 3) : [] });
    }
    return json({ ok: false, error: "Compito sconosciuto: " + task });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }); }
}
