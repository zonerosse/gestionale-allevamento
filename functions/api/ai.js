import { json, role, deny, loadData, farmOf, can } from "../_lib.js";
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
   - "agenda":   { text, today, weekday, families } → { type, date, time, who, from, dog, want, note, summary }
   - "post":     { facts, idea?, key?, seen? } → { text }                       post per gli Aggiornamenti del profilo Google
                 (key = foto del post in R2: Claude la guarda e usa solo ciò che si vede, 12/10/2026)
   - "foto":     { key }                    → { seen }                          cosa si vede nella foto caricata per un post
   - "recensione": { who, stars, text, idea? } → { options:[testo] }  2 ringraziamenti brevi, o 1 risposta con l'idea di Paolo
   - "sito":     { fields:{title,desc,h1,ap}, links:[testo], kw:{it,en,de}, orig } → { en:{…,links}, de:{…,links} }
                 Google → Pagine del sito: traduce in inglese e tedesco i campi cambiati da Paolo in italiano
   - "sacco":    { parts:[base64 jpeg] }   → { brand, name, stage, kcal, kcalRead, p, f, fi, a, u }  foto del sacco di crocchette (18/10/2026):
                 kcal per 100 g scritte sul sacco; se mancano, calcolate qui dai componenti analitici (Atwater modificato, NRC/FEDIAF)
   - "fattura":  { parts:[jpeg] | data(pdf), media } → { shop, date, total, lines:[{desc,cat,puppy,brand,name,qty,kg,unit,total}] }  fattura o
                 scontrino (24/10/2026): ogni riga con la voce delle Spese generali; prezzo di UN sacco IVA compresa (Puppy = stima del cibo)
   - "kcalnome": { brand, name }           → { kcal, src, url }  kcal per 100 g cercate in internet dal nome letto sul sacco (18/10/2026)
   Paolo non conosce inglese e tedesco: le traduzioni devono essere fedeli, naturali, senza aggiunte. */
const MODEL = "claude-sonnet-5-5";
const LANGS = { it: "italiano", en: "inglese", de: "tedesco", fr: "francese", es: "spagnolo", sl: "sloveno", hr: "croato", pl: "polacco", nl: "olandese", pt: "portoghese" };
const voice = F => `Scrivi come ${F.person}, allevatore di ${F.breed} a ${F.city} (${F.provName}), allevamento ${F.name}, dal ${F.since}.
Tono: diretto, cordiale, sobrio. Prima persona singolare. Niente titoli o palmarès dei cani ("non tirarsela"), niente parole vuote (passione, amore per la razza, professionalità), niente promesse, niente prezzi, niente pressione commerciale. Frasi brevi. Si firma "${F.first}".`;
// 13/10/2026: a volte Claude risponde senza il JSON (testo vuoto o solo parole): prima dava "Unexpected end of JSON input".
// Ora si riprova una volta da soli; se ancora niente, un messaggio chiaro.
export const ask = async (env, system, content, max = 1200, tools) => {
  for (let i = 0; ; i++) {
    try { return await ask1(env, system, content, max, tools); }
    catch (e) { if (!e.noJson) throw e; if (i >= 1) throw new Error("Claude ha risposto in modo strano. Riprova tra un attimo. (" + e.why + ")"); }
  }
};
const ask1 = async (env, system, content, max, tools) => {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ model: MODEL, max_tokens: max, system: system + "\nRispondi SOLO con un oggetto JSON valido, senza altro testo.", messages: [{ role: "user", content }] }, tools ? { tools } : {})) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || "errore";
    throw new Error(/credit|balance/i.test(m) ? "Credito di Claude finito: ricarica in console.anthropic.com → Billing." : "Claude " + r.status + ": " + m);
  }
  const t = (j.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  try { if (a < 0 || z <= a) throw 0; return JSON.parse(t.slice(a, z + 1)); }
  catch (x) {
    // 13/10/2026 (post che non si riscriveva mai): si salva quello che c'è. JSON tagliato o con a capo dentro il testo →
    // si prende il campo "text"; solo parole senza JSON → quelle sono il testo.
    const m = t.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (m && m[1].trim()) { let v = m[1]; try { v = JSON.parse('"' + v.replace(/\n/g, "\\n").replace(/\r/g, "") + '"'); } catch (y) { v = v.replace(/\\n/g, "\n").replace(/\\"/g, '"'); } return { text: v.trim() }; }
    if (t && a < 0) return { text: t };
    const e = new Error("senza JSON"); e.noJson = true; e.why = (j.stop_reason || "?") + (t ? ": " + t.slice(0, 120) : ", risposta vuota"); throw e;
  }
};
// Foto caricata dal gestionale (/files/<chiave> in R2) come blocco immagine per Claude; null se manca o non è una foto
async function photoBlock(env, key) {
  if (!key) return null;
  const obj = await env.FILES.get(String(key).replace(/^\/?files\//, "")); if (!obj) return null;
  const media = (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg";
  if (!/^image\/(jpeg|png|gif|webp)$/.test(media)) return null;
  return { type: "image", source: { type: "base64", media_type: media, data: b64(await obj.arrayBuffer()) } };
}
const b64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
export async function onRequestPost({ request, env }) {
  // permessi per sezione: ogni compito vale per la sua voce del menu; quelli non elencati solo per l'admin
  const p0 = await request.clone().json().catch(() => ({}));
  const NEED = { in: [["traduci", "attesa", "agenda"], 1], out: [["traduci", "attesa"], 1], risposte: [["traduci", "attesa"], 1], interessato: ["attesa", 2],
    richiesta: ["attesa", 2], agenda: ["agenda", 2], referto: [["cani", "coi"], 2], cessione: ["proprietari", 2], testmating: ["coi", 2], recensione: ["recensioni", 2], post: ["recensioni", 2], pulisci: ["recensioni", 2], foto: ["recensioni", 2], sito: ["recensioni", 2], sacco: ["cani", 1], kcalnome: ["cani", 1], fattura: ["conti", 2], expo: ["esposizioni", 2], libretto: [ "cani", 2 ], compila: [ [ "cani", "cucciolate", "proprietari", "conti", "anagrafe", "esposizioni" ], 2 ] };
  const nd = NEED[p0.task];
  if ((await role(request, env)) !== "admin" && !(nd && await can(request, env, nd[0], nd[1]))) return deny();
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: "Manca la chiave ANTHROPIC_API_KEY in Cloudflare (Settings → Variables and Secrets)." });
  try {
    const p = await request.json(), task = p.task;
    const F = farmOf(((await loadData(env).catch(() => null)) || {}).data);
    if (task === "in") {
      const o = await ask(env, `Traduci in italiano un messaggio ricevuto da un allevatore di cani (WhatsApp o email). Traduzione fedele e naturale, senza aggiungere né togliere niente. Riconosci la lingua originale.
Formato: {"lang":"codice ISO 639-1","it":"traduzione italiana"}`, String(p.text || "").slice(0, 4000));
      return json({ ok: true, lang: o.lang || "en", langName: LANGS[o.lang] || o.lang, it: o.it || "" });
    }
    if (task === "out") {
      const L = LANGS[p.lang] ? p.lang : "en";
      const o = await ask(env, `Traduci in ${LANGS[L]} il messaggio scritto in italiano da ${F.first}, allevatore di cani, per un cliente o un allevatore straniero. Traduzione fedele e naturale, registro cordiale (in tedesco "Sie" se il testo dà del lei, altrimenti "du"; in inglese naturale e semplice). Non aggiungere saluti, frasi o informazioni che non ci sono. Mantieni a capo ed emoji.
Formato: {"text":"traduzione"}`, String(p.text || "").slice(0, 4000));
      return json({ ok: true, text: o.text || "" });
    }
    if (task === "risposte") {
      const L = LANGS[p.lang] ? p.lang : "en";
      const o = await ask(env, `${voice(F)}
Ti arriva un messaggio (WhatsApp o email) da un cliente o un allevatore. ${p.idea ? `${F.first} ti dice in breve cosa vuole rispondere: "${String(p.idea).slice(0, 800)}". Scrivi 2 versioni della risposta che dicono ESATTAMENTE questo (una più breve, una un po' più calda), senza aggiungere promesse o informazioni che lui non ha dato.` : "Proponi 3 risposte DIVERSE nell'approccio, non solo nel tono (es. breve e cordiale / con le informazioni utili / che fissa il prossimo passo; scegli tu i tre approcci più adatti al messaggio)."}
Per ognuna: "label" (2-4 parole in italiano che dicono cosa fa), "it" (la risposta in italiano, massimo 60 parole, firmata "${F.first}" solo se il messaggio ricevuto è lungo o formale), "out" (la stessa risposta tradotta fedelmente in ${LANGS[L]}).
Non inventare fatti su cani, date, prezzi o salute: se servono, scrivi una parentesi quadra da completare, es. [data].
Formato: {"options":[{"label":"","it":"","out":""}]}`,
        `Messaggio originale:\n${String(p.msg || "").slice(0, 3000)}\n\nTraduzione italiana:\n${String(p.it || "").slice(0, 3000)}`, 1800);
      return json({ ok: true, options: (o.options || []).slice(0, 3).map(x => ({ label: x.label || "", it: x.it || "", out: x.out || "" })) });
    }
    if (task === "foto") {
      // 12/10/2026 (Paolo): la foto caricata per un post viene "letta" subito, così Paolo vede cosa ha capito Claude.
      const img = await photoBlock(env, p.key); if (!img) return json({ ok: false, error: "Foto non trovata." });
      const o = await ask(env, `Guarda la foto, caricata dall'allevamento ${F.name} (${F.breed}) per un post sul profilo Google.
Descrivi in italiano, in una o due frasi brevi (massimo 35 parole), SOLO quello che si vede: cani (razza se riconoscibile, colore, età apparente cucciolo/adulto, cosa fanno), se ci sono persone e cosa fanno con il cane (senza descriverne l'aspetto: niente viso, capelli, età, vestiti), luogo, situazione.
Non inventare nomi, date o fatti.
Formato: {"seen":"..."}`, [img, { type: "text", text: "Ecco la foto." }], 300);
      return json({ ok: true, seen: String(o.seen || "") });
    }
    if (task === "pulisci") {
      // 23/10/2026 (Paolo): post vecchi del profilo Google con parole che sul sito non si usano più. Si tolgono SOLO quelle.
      const flags = (Array.isArray(p.flags) ? p.flags : []).map(x => String(x).slice(0, 80)).slice(0, 12);
      const o = await ask(env, `${voice(F)}
Ti do il testo di un post già pubblicato sul profilo Google dell'allevamento. Correggilo togliendo SOLO queste cose, che sul sito dell'allevamento non si scrivono più: ${flags.map(x => "«" + x + "»").join(", ") || "nessuna"}.
Regole: niente linguaggio da vendita (prenotazioni, lista d'attesa, caparra, acconto, clienti, acquirenti: chi prende un cucciolo è «una famiglia»); niente parole vuote come «passione», «professionalità», «esperienza pluriennale»; non dire mai quanti cuccioli sono nati né quanti maschi o femmine.
Tutto il resto resta IDENTICO: stesse frasi, stesso ordine, stessi a capo, stesse emoji. Se una frase serviva solo a quello che togli, toglila intera; se resta una frase monca, sistemala con il minimo di parole. Non aggiungere fatti, inviti, numeri di telefono o hashtag.
Formato: {"text":"testo corretto"}`, String(p.text || "").slice(0, 1600), 1500);
      return json({ ok: true, text: String(o.text || "") });
    }
    if (task === "post") {
      // Post per la sezione "Aggiornamenti" del profilo Google: una notizia, non una vendita.
      const img = await photoBlock(env, p.key);
      const o = await ask(env, `${voice(F)}
Scrivi un post per la sezione "Aggiornamenti" del profilo Google dell'allevamento, in italiano, partendo SOLO dai fatti che ti do.
Regole: 50-110 parole; una notizia (cosa è successo, cosa si vede nelle foto), con un invito sobrio a leggere il resto sul sito; nessun numero di telefono, email o indirizzo; niente prezzi, nessuna offerta, mai le parole disponibile/disponibili, vendita, clienti, acquisto, prenotazione, caparra; non dire quanti cuccioli ci sono; niente hashtag; al massimo un'emoji; nessun fatto che non sia nei dati.${p.idea ? ` ${F.first} aggiunge: "${String(p.idea).slice(0, 500)}".` : ""}
${img ? ` Ti do anche la FOTO del post (12/10/2026, correzione chiesta da ${F.first}: il primo post sembrava una didascalia). La foto serve SOLO a capire il momento: NON descriverla ("nella foto si vede…", "una donna sorride…") e NON parlare MAI dell'aspetto delle persone (viso, capelli, età, vestiti, espressione); le persone al massimo come "la sua famiglia", "a casa", "con noi", senza nomi se ${F.first} non li scrive. Scrivi un vero post dell'allevamento: parti dal cane e da quello che il momento racconta della razza (affetto per la famiglia, voglia di giocare, carattere, vita in casa, crescita, esposizioni), con un tono caldo e naturale, come lo scriverebbe ${F.first}; 40-90 parole; se viene naturale, un pensiero sulla vita con uno ${F.breed}; chiudi con un invito sobrio al sito; niente firma. Nomi dei cani solo se li scrive lui o se sono in «dal_gestionale».${p.seen ? ` (Per capire il momento: ${String(p.seen).slice(0, 300)})` : ""}` : ""}
${p.facts && Array.isArray(p.facts.dal_gestionale) && p.facts.dal_gestionale.length ? ` Oggi è ${new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}. Nei fatti trovi «dal_gestionale»: i dati veri dei cani che ${F.first} ha citato (nome di chiamata, sesso, età, genitori, cucciolata, giorno del ritiro e se è già avvenuto, città e paese dove va a vivere, nomi dei fratelli): sono lo SFONDO, non un elenco da riportare: scegli al massimo UNO o DUE dettagli che rendono la storia viva (per esempio il nome e la città dove va a vivere, oppure i fratelli che restano a casa) e lascia perdere il resto; mai date, genitori, età e colore tutti insieme. Città e paese sì, mai via o numero civico. Date dette in modo naturale ("sabato scorso", "a metà ottobre" solo se sei sicuro; altrimenti la data). Se il ritiro è nel futuro non dire che è già partito. Le persone invece non si nominano MAI nel post: niente nomi né cognomi di proprietari o familiari (anche se ${F.first} li scrive nello spunto), solo «la sua famiglia», «la sua nuova famiglia», «a casa sua»; la «mamma di …» diventa per esempio «in braccio alla sua nuova famiglia».` : ""}
${p.facts && /libero/.test(String(p.facts.tipo || "")) ? ` STILE (12/10/2026, richiesta di ${F.first}: «post simpatici e fantasiosi, non snocciolare dati»): il post deve far sorridere chi lo legge. Racconta una piccola scena con fantasia e calore, con un pizzico di ironia leggera: per esempio la voce o i pensieri del cucciolo («Rocco ha già deciso: il divano di Bologna è suo»), un'immagine buffa, un paragone, una battuta sullo Staffy che sorride sempre. Ogni post diverso dagli altri: cambia apertura e struttura, niente formule fisse («Oggi è un giorno speciale», «Siamo felici di annunciare» sono vietate). Frasi corte, ritmo vivo, 30-80 parole. Resta vero: la fantasia è nel modo di raccontare, i fatti non si inventano.` : ""}
Formato: {"text":"testo del post"}`, img ? [img, { type: "text", text: JSON.stringify(p.facts || {}).slice(0, 3000) }] : JSON.stringify(p.facts || {}).slice(0, 3000), 1500);
      return json({ ok: true, text: String(o.text || "") });
    }
    if (task === "sito") {
      // Google → Pagine del sito (08/10/2026): Paolo scrive solo in italiano, qui si traduce in inglese e tedesco.
      const fields = {}; for (const k of ["title", "desc", "h1", "ap"]) if (p.fields && p.fields[k]) fields[k] = String(p.fields[k]).slice(0, 1500);
      const links = (Array.isArray(p.links) ? p.links : []).map(x => String(x || "").slice(0, 200)).slice(0, 6);
      const kw = p.kw || {}, orig = p.orig || {};
      const o = await ask(env, `Traduci in inglese e in tedesco alcuni testi del sito dell'allevamento ${F.name} (${F.breed}, ${F.city}, Italia), scritti in italiano da ${F.first}.
Traduzione fedele e naturale per un sito web: stesso significato, niente aggiunte, niente tagli. Tedesco con "Sie".
Campi: "title" = titolo per Google, DEVE stare fra 30 e 60 caratteri; "desc" = descrizione per Google, DEVE stare fra 140 e 165 caratteri
(conta i caratteri, spazi compresi; se la traduzione esce fuori misura riformula, senza cambiare il senso); "h1" = titolo grande della pagina;
"ap" = frase di apertura della pagina; "links" = testi di link verso altre pagine, nello stesso ordine.
Parola chiave della pagina: italiano "${kw.it || ""}", inglese "${kw.en || ""}", tedesco "${kw.de || ""}". Se il testo italiano contiene la parola
chiave italiana, la traduzione deve contenere ESATTAMENTE la parola chiave inglese o tedesca indicata (stesse parole, stesso ordine).
Mai punti esclamativi. Nomi di cani, linee di sangue, ENCI, SBTPedigree e nomi propri restano come sono. Niente parole da vendita
(sale, buy, for sale, kaufen, Verkauf) se non ci sono in italiano.
Come riferimento di stile, i testi inglesi e tedeschi di oggi della stessa pagina: ${JSON.stringify(orig).slice(0, 1500)}
Formato: {"en":{"title":"","desc":"","h1":"","ap":"","links":[]},"de":{"title":"","desc":"","h1":"","ap":"","links":[]}} — solo i campi che ti do.`,
        JSON.stringify({ fields, links }), 2500);
      const pick = x => { const r = {}; for (const k of Object.keys(fields)) if (x && x[k]) r[k] = String(x[k]); r.links = links.map((_, i) => String(((x && x.links) || [])[i] || "")); return r; };
      return json({ ok: true, en: pick(o.en), de: pick(o.de) });
    }
    if (task === "agenda") {
      // Agenda (ritiri dei cuccioli e visite in allevamento): legge un messaggio WhatsApp e propone l'appuntamento.
      const o = await ask(env, `Leggi un messaggio WhatsApp arrivato all'allevamento ${F.name} (${F.city}, ${F.provName}) e capisci se è:
- "ritiro": una famiglia che fissa il giorno per venire a prendere il suo cucciolo;
- "visita": qualcuno che vuole venire a vedere i cani e conoscere l'allevamento;
- "altro": niente di tutto questo.
Oggi è ${String(p.today || "")} (${String(p.weekday || "")}). Trasforma "sabato", "domani", "la prossima settimana" in una data AAAA-MM-GG nel futuro più vicino; l'ora in HH:MM (24 ore; "verso le 4 del pomeriggio" = 16:00). Se manca, lascia vuoto: non inventare.
Famiglie con un cucciolo da ritirare (id, cucciolo, famiglia, telefono, città): ${JSON.stringify(p.families || []).slice(0, 3000)}
Se è un ritiro, scegli in "dog" l'id della famiglia/cucciolo giusto solo se il messaggio lo fa capire (nome del cucciolo, nome della persona, città); altrimenti "".
Scrivi corto: in "who" solo i nomi o "la famiglia" (niente frasi come "numero di persone non indicato"); in "note" al massimo poche parole utili, niente ripetizioni di giorno e ora; se un dato manca lascia il campo vuoto senza commentarlo.
Rispondi solo con JSON: {"type":"ritiro|visita|altro","date":"","time":"","who":"chi viene (nomi, quante persone)","from":"città se detta","dog":"","want":"per le visite: cosa cerca (maschio/femmina, quando) se detto","note":"altro di utile in poche parole","summary":"una riga in italiano"}`,
        String(p.text || "").slice(0, 3000), 600);
      return json({ ok: true, ...o });
    }
    if (task === "recensione") {
      // Recensione Google (scheda Recensioni): senza idea → 2 ringraziamenti brevi; con idea → 1 risposta che dice quello.
      const o = await ask(env, `${voice(F)}
Ti arriva una recensione pubblica del profilo Google dell'allevamento. La risposta è pubblica: la leggono tutti.
${p.idea ? `${F.first} ti dice in breve cosa vuole dire: "${String(p.idea).slice(0, 800)}". Scrivi UNA risposta che dice esattamente questo, con un ringraziamento, senza aggiungere promesse o informazioni che lui non ha dato.` : "Scrivi DUE risposte brevi di ringraziamento, diverse fra loro (una più asciutta, una più calda), che riprendono qualcosa di concreto della recensione se c'è."}
Regole: massimo 40 parole ciascuna; nella lingua della recensione; niente firma; niente hashtag; niente date precise, nomi di cani o fatti che non sono scritti nella recensione o nell'idea di ${F.first}; mai le parole clienti, acquisto, vendita, prenotazione, caparra (l'allevamento è amatoriale: si parla di famiglie e di affido). Se la recensione è negativa: tono calmo, nessuna polemica, invito a parlarne di persona.
Formato: {"options":["risposta"]}`,
        `Autore: ${String(p.who || "").slice(0, 80)}\nStelle: ${+p.stars || ""}\nRecensione:\n${String(p.text || "(nessun testo, solo stelle)").slice(0, 3000)}`, 700);
      return json({ ok: true, options: (o.options || []).map(String).filter(Boolean).slice(0, 2) });
    }
    if (task === "interessato") {
      const o = await ask(env, `Da un messaggio WhatsApp di una persona interessata a un cucciolo di ${F.breed}, estrai SOLO quello che c'è scritto (stringa vuota se manca, non inventare):
"name" (nome con cui si firma o si presenta), "city", "country" (in italiano, es. "Slovenia"), "sex" ("maschio", "femmina" o ""), "when" (quando lo vorrebbe, es. "primavera 2027"), "lang" (codice ISO 639-1 della lingua del messaggio), "note" (in italiano, una frase con le domande o le richieste fatte).
Formato: {"name":"","city":"","country":"","sex":"","when":"","lang":"","note":""}`, `Messaggio:\n${String(p.msg || "").slice(0, 3000)}\n\nTraduzione italiana:\n${String(p.it || "").slice(0, 3000)}`, 600);
      return json({ ok: true, name: o.name || "", city: o.city || "", country: o.country || "", sex: o.sex || "", when: o.when || "", lang: o.lang || "it", note: o.note || "" });
    }
    if (task === "richiesta") {
      const o = await ask(env, `${voice(F)}
Ti arriva una richiesta di informazioni dal modulo contatti del sito. Fai tre cose:
1) "sunto": riassunto in italiano, 1-2 frasi, con i dati utili (chi è, dove vive, cosa cerca, quando, domande fatte).
2) "bozza": risposta in italiano scritta da ${F.first}, breve (massimo 90 parole), che risponde solo alle domande fatte, senza inventare informazioni sull'allevamento, sui cuccioli o sulle date. Se servono dati che non conosci, lascia una parentesi quadra da completare, es. [data della prossima cucciolata].
3) "out": la stessa bozza tradotta nella lingua di chi ha scritto (se è italiano, uguale alla bozza).
Formato: {"lang":"codice ISO 639-1 di chi scrive","sunto":"...","bozza":"...","out":"..."}`,
        `Nome: ${p.name || ""}\nMessaggio:\n${String(p.msg || "").slice(0, 4000)}`, 1500);
      return json({ ok: true, lang: o.lang || "it", langName: LANGS[o.lang] || o.lang, sunto: o.sunto || "", bozza: o.bozza || "", out: o.out || "" });
    }
    if (task === "cessione") { // 20/10/2026: una pagina della «Denuncia di cessione del cane» del Comune (scansione) → microchip, cane, acquirente, data
      let data = String(p.data || "").replace(/^data:[^,]*,/, ""); if (!data) return json({ ok: false, error: "Manca il file." });
      const media = p.media || "application/pdf";
      const doc = media === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } } : { type: "image", source: { type: "base64", media_type: media, data } };
      const o = await ask(env, `Leggi questa pagina: è una «Denuncia di cessione del cane» di un Comune italiano (scansione). Copia SOLO quello che c'è scritto, senza interpretare.
Formato: {"chip":"numero di microchip, solo cifre, o \"\"","dog":"nome del cane come scritto","buyer":"nome e cognome di chi riceve il cane (dopo «al Sig.»)","date":"data della cessione (dopo «in data»), AAAA-MM-GG, o \"\"","sex":"M, F o \"\""}`, [doc, { type: "text", text: "Leggi la pagina." }], 400);
      return json({ ok: true, chip: String(o.chip || "").replace(/\D/g, ""), dog: o.dog || "", buyer: o.buyer || "", date: o.date || "", sex: o.sex || "" });
    }
    if (task === "referto") {
      let data = p.data, media = p.media;
      if (p.key) { const obj = await env.FILES.get(String(p.key).replace(/^\/?files\//, "")); if (!obj) return json({ ok: false, error: "File non trovato." }); data = b64(await obj.arrayBuffer()); media = (obj.httpMetadata && obj.httpMetadata.contentType) || media; }
      if (!data) return json({ ok: false, error: "Manca il file." });
      data = String(data).replace(/^data:[^,]*,/, "");
      const doc = media === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: media || "image/jpeg", data } };
      const dog = p.dog || {};
      const o = await ask(env, `Leggi un documento su un cane (referto, test genetici, scheda SBTpedigree, certificato, libretto, pedigree, risultati di esposizione). Leggi TUTTO ed estrai SOLO quello che c'è scritto, senza interpretare.
- "title": titolo breve in italiano per l'archivio (es. "Test genetici L2HGA e HC – Laboklin").
- "title_en": lo stesso in inglese.
- "date": data del referto (AAAA-MM-GG) o "".
- "lab": laboratorio o clinica, o "".
- "chip": numero di microchip scritto sul referto (solo cifre), o "".
- "tests": TUTTI i risultati di salute scritti, una riga breve per ognuno nelle tre lingue, con il VALORE esattamente com'è scritto:
  test genetici ("L2HGA: esente (N/N)" / "L2HGA: clear (N/N)" / "L2HGA: frei (N/N)"; "esente per discendenza (genitori esenti)" / "clear by parents" / "frei über Eltern"; portatore (N/P) / carrier / Träger; affetto (P/P) / affected / betroffen),
  displasia dell'anca ("Anche (HD): A/A" / "Hips (HD): A/A" / "Hüften (HD): A/A"), gomiti ("Gomiti (ED): 0/0" / "Elbows (ED): 0/0" / "Ellbogen (ED): 0/0"),
  dentatura ("Dentatura: chiusura a forbice completa" / "Dentition: correct scissor bite" / "Gebiss: korrektes Scherengebiss"), occhi, cuore, rotula, BAER, ecc.
  Se è indicato chi ha fatto la valutazione (es. "by Veterinary") aggiungilo fra parentesi (veterinario / veterinarian / Tierarzt). Lista vuota se non c'è nessun risultato.
- "note": una frase in italiano su cos'altro contiene (vaccino, esame, ecc.), o "".
- "items": TUTTO quello che c'è scritto sul cane, catalogato, una voce per ogni dato, ognuna con "cat" fra:
  "genetico" (test DNA), "anche", "gomiti", "dentatura", "occhi", "cuore", "rotula", "udito", "altra salute", "vaccino" (con data e prodotto),
  "titolo" (titoli e risultati di esposizione), "identificazione" (microchip, tatuaggio, LOI/numero di registro, sesso, nascita, colore),
  "pedigree" (padre, madre, allevatore, proprietario), "altro". Ogni voce: {"cat":"","it":"Etichetta: valore","en":"","de":"","date":"AAAA-MM-GG o vuoto"}.
  Non saltare niente di quello che è scritto, anche se non è salute. Le voci di salute e genetica vanno anche in "tests".
Formato: {"title":"","title_en":"","date":"","lab":"","chip":"","loi":"","tests":[{"it":"","en":"","de":""}],"items":[{"cat":"","it":"","en":"","de":"","date":""}],"note":""}`,
        [doc, { type: "text", text: `Cane atteso: ${dog.name || ""}, microchip ${dog.chip || "non indicato"}.` }], 3000);
      return json({ ok: true, title: o.title || "", title_en: o.title_en || "", date: o.date || "", lab: o.lab || "", chip: String(o.chip || "").replace(/\D/g, ""), loi: o.loi || "", tests: Array.isArray(o.tests) ? o.tests : [], items: Array.isArray(o.items) ? o.items : [], note: o.note || "" });
    }
    if (task === "sacco") {
      const parts = (Array.isArray(p.parts) ? p.parts : []).filter(Boolean).slice(0, 3).map(x => String(x).replace(/^data:[^,]*,/, ""));
      if (!parts.length) return json({ ok: false, error: "Manca la foto." });
      const o = await ask(env, `Leggi le foto di un sacco di crocchette per cani (fronte e/o retro). Estrai SOLO quello che è scritto, senza inventare.
- "brand": marca; "name": nome del prodotto (linea, taglia, età, gusto), come scritto.
- "stage": "puppy" se è per cuccioli/junior, "adult" se per adulti, "senior", oppure "" se non si capisce.
- "kcal": energia metabolizzabile in kcal per 100 g SOLO se è scritta sul sacco (converti: 3850 kcal/kg = 385; 16,1 MJ/kg = 385; 385 kcal/100 g = 385). null se non è scritta.
- "p","f","fi","a","u": percentuali dei componenti analitici: proteina grezza, grassi (oli e grassi grezzi), fibra grezza, ceneri grezze, umidità. Numeri (es. 25.5). null se un valore non è scritto.
- "ca","ph": calcio e fosforo in % SOLO se scritti (1,2% = 1.2; 12 g/kg = 1.2). null se non scritti.
- "add": additivi nutrizionali PER KG, solo quelli scritti (null gli altri): "va" vitamina A UI/kg, "vd" vitamina D3 UI/kg, "ve" vitamina E mg/kg
  (se in UI/kg stesso numero), "zn" zinco, "cu" rame, "io" iodio, "fe" ferro, "se" selenio, "mn" manganese in mg/kg (somma le forme dello stesso elemento).
  CONVERTI i minerali in ELEMENTO se il sacco scrive il composto: zinco solfato monoidrato 35,5%, ossido 78%, chelato dell'analogo idrossilato della metionina 16%, chelato di glicina/amminoacidi idrato 15%; rame solfato pentaidrato 25%, chelati 16% (HMTBa) o 15%, ossido 80%; manganese solfato monoidrato 32%, ossido manganoso 77%, chelato HMTBa 13%, chelato di glicina 15%, chelato di amminoacidi 10%; ferro solfato ferroso monoidrato 30%, chelato di glicina 15%, chelato di amminoacidi 9%, carbonato 38%; iodio iodato di calcio anidro 65%, ioduro di potassio 76%; selenio selenito di sodio 45,6%, lievito al selenio e selenometionina già come selenio. Se è scritto l'elemento (es. «Zn 150 mg»), usa quello.
Formato: {"brand":"","name":"","stage":"","kcal":null,"p":null,"f":null,"fi":null,"a":null,"u":null,"ca":null,"ph":null,"add":{"va":null,"vd":null,"ve":null,"zn":null,"cu":null,"io":null,"fe":null,"se":null,"mn":null}}`,
        [...parts.map(d => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d } })), { type: "text", text: "Foto del sacco." }], 900);
      const n = v => (v === null || v === undefined || v === "" || isNaN(+v)) ? null : +v;
      const r = { brand: String(o.brand || ""), name: String(o.name || ""), stage: String(o.stage || ""), p: n(o.p), f: n(o.f), fi: n(o.fi), a: n(o.a), u: n(o.u) };
      for (const q of ["ca", "ph"]) { const v = n(o[q]); r[q] = v != null && v > 0 && v < 5 ? v : null; } // 23/10/2026: nutrienti e additivi (squilibri)
      { const A = {}; let c = 0; for (const q of ["va", "vd", "ve", "zn", "cu", "io", "fe", "se", "mn"]) { const v = n(o.add && o.add[q]); if (v != null && v > 0 && v < 1e6) { A[q] = v; c++; } } r.add = c ? A : null; }
      let k = n(o.kcal); if (k && k > 1000) k = k / 10; // kcal/kg scritte per sbaglio
      r.kcalRead = !!(k && k > 200 && k < 700);
      if (r.kcalRead) r.kcal = Math.round(k);
      else if (r.p != null && r.f != null && r.a != null) { const u = r.u == null ? 10 : r.u, nfe = Math.max(0, 100 - r.p - r.f - (r.fi || 0) - r.a - u); r.kcal = Math.round(3.5 * r.p + 8.5 * r.f + 3.5 * nfe); r.uGuess = r.u == null; }
      else r.kcal = null;
      return json(Object.assign({ ok: true }, r));
    }
    if (task === "fattura") {
      let docs = [];
      if (p.data) docs = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: String(p.data).replace(/^data:[^,]*,/, "") } }];
      else docs = (Array.isArray(p.parts) ? p.parts : []).filter(Boolean).slice(0, 4).map(x => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: String(x).replace(/^data:[^,]*,/, "") } }));
      if (!docs.length) return json({ ok: false, error: "Manca la fattura." });
      const o = await ask(env, `Leggi una fattura, ricevuta o scontrino di spese per cani (negozio di animali anche online come Zooplus, Amazon, Arcaplanet; veterinario; farmacia). Estrai SOLO quello che è scritto, senza inventare.
- "shop": nome del negozio, veterinario o venditore; "date": data del documento AAAA-MM-GG o ""; "total": totale pagato in euro (numero) o null.
- "lines": TUTTE le righe con un importo, una per prodotto o prestazione (anche spedizione). Per ogni riga:
  "desc": la descrizione com'è scritta; "cat" fra "Crocchette" (cibo secco per cani), "Vaccini", "Visite" (visite, esami, ecografie, prestazioni del veterinario),
  "Terapie" (farmaci, antiparassitari, integratori), "Altro" (snack, umido, accessori, spedizione, tutto il resto);
  "puppy": true SOLO se sono crocchette per cuccioli (puppy, junior, starter), altrimenti false;
  "brand": marca e "name": nome del prodotto senza peso e quantità (solo per le crocchette, se no "");
  "qty": quante confezioni (numero, 1 se non scritto); "kg": peso di UN sacco in kg per le crocchette (es. "12 kg" = 12, "2 x 12 kg" = 12 e qty 2, "800 g" = 0.8), null se non scritto o non è cibo;
  "unit": prezzo di UNA confezione in euro IVA COMPRESA e dopo gli sconti della riga (se la fattura mostra imponibile e IVA a parte, aggiungi l'IVA indicata; se c'è solo il totale della riga, dividi per qty);
  "total": totale della riga IVA compresa.
Formato: {"shop":"","date":"","total":null,"lines":[{"desc":"","cat":"","puppy":false,"brand":"","name":"","qty":1,"kg":null,"unit":null,"total":null}]}`,
        [...docs, { type: "text", text: "Fattura o scontrino." }], 2500);
      const n = v => (v === null || v === undefined || v === "" || isNaN(+String(v).replace(",", "."))) ? null : +String(v).replace(",", ".");
      const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 30).map(x => ({ desc: String(x.desc || ""), cat: ["Crocchette", "Vaccini", "Visite", "Terapie", "Altro"].includes(x.cat) ? x.cat : "Altro", puppy: !!x.puppy, brand: String(x.brand || ""), name: String(x.name || ""), qty: Math.max(1, Math.round(n(x.qty) || 1)), kg: (n(x.kg) > 0 && n(x.kg) < 50) ? n(x.kg) : null, unit: n(x.unit) > 0 ? Math.round(n(x.unit) * 100) / 100 : null, total: n(x.total) }));
      return json({ ok: true, shop: String(o.shop || ""), date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || "") ? o.date : "", total: n(o.total), lines });
    }
  // Compila da foto o documento (25/10/2026): una foto vale come un PDF. Claude legge e restituisce i campi del modulo indicato da "kind".
  if (task === "compila") {
   const CK = {
    cane: ["un pedigree, un certificato LOI/ROI, un libretto o un passaporto di un cane", { name: "nome completo del cane come sul documento (con l'affisso)", sex: "\"M\" o \"F\"", birth: "data di nascita", color: "mantello / colore", loi: "numero LOI o ROI o del libro genealogico (es. \"LOI 23/123456\")", chip: "numero del microchip (solo cifre)", sire: "nome del padre", sire_loi: "LOI del padre", dam: "nome della madre", dam_loi: "LOI della madre", titles: "titoli del cane scritti sul documento", tests: "test sanitari scritti sul documento", breeder: "allevatore" }],
    ped: ["un pedigree (anche estero, qualsiasi lingua)", { tree: "albero degli antenati: {\"s\":{\"name\":\"\",\"loi\":\"\",\"s\":{...},\"d\":{...}},\"d\":{...}} dove s = padre e d = madre; fino a 4 generazioni sopra il cane, solo quelli scritti" }],
    sh: ["la scheda del giudice, il libretto delle qualifiche o il catalogo di un'esposizione canina", { date: "data dell'esposizione", show: "nome e luogo dell'esposizione", judge: "giudice (nome e nazione)", cls: "classe (Baby, Juniores, Giovani, Intermedia, Libera, Lavoro, Campioni, Veterani)", qual: "qualifica (Eccellente, Molto Buono, Buono, Sufficiente, Molto Promettente, Promettente, Poco Promettente, Squalificato, Non giudicabile)", rank: "classifica come numero 1-4 o \"\"", titles: "elenco dei titoli presi (CAC, Ris. CAC, JCAC, CACIB, Ris. CACIB, BOB, JBOB, BOS, Miglior Giovane, Best Baby, Best Puppy, BIG, BIS)", text: "giudizio scritto, parola per parola, tradotto in italiano se in altra lingua" }],
    rp: ["un referto di progesterone, una visita o un foglio scritto a mano su calore o monta", { date: "data", value: "valore del progesterone in ng/ml (numero) o \"\"", note: "nota breve con quello che c'è scritto" }],
    litter: ["un Modello A, una denuncia di monta e nascita o un foglio sulla cucciolata", { dam: "nome della madre", sire: "nome del padre", birth: "data di nascita dei cuccioli", pups: "numero dei cuccioli nati (numero) o \"\"", note: "maschi/femmine e altre informazioni utili" }],
    w: ["un foglio (anche scritto a mano) con le pesate dei cuccioli", { date: "data della pesata", pups: "elenco [{\"name\":\"nome o colore del collarino\",\"g\":peso in grammi}]" }],
    nasc: ["un foglio (anche scritto a mano) sul parto e la nascita dei cuccioli", { type: "tipo di parto: \"naturale\", \"cesareo\" o \"naturale con aiuto\" o \"\"", start: "ora di inizio del parto HH:MM o \"\"", note: "note sul parto", pups: "elenco dei cuccioli in ordine di nascita [{\"time\":\"HH:MM\",\"collar\":\"colore del collarino in italiano\",\"sex\":\"M o F\",\"g\":peso in grammi}]" }],
    famiglia: ["una carta d'identità, una patente, una tessera sanitaria o un biglietto con i dati di una persona", { name: "nome e cognome", country: "paese (Italia se italiano)", phone: "telefono", email: "email", addr: "indirizzo di residenza completo", bplace: "luogo di nascita (con la sigla della provincia)", bdate: "data di nascita", cf: "codice fiscale" }],
    ppb: ["un documento d'identità o la tessera sanitaria dell'acquirente", { bplace: "luogo di nascita", bdate: "data di nascita", cf: "codice fiscale", res: "residenza: CAP, città, via", cell: "cellulare", mail: "email" }],
    inc: ["una ricevuta di bonifico, uno screenshot di un pagamento o una ricevuta", { date: "data del pagamento", amount: "importo in euro (numero)", txt: "chi ha pagato e la causale" }],
    acq: ["un pedigree, un passaporto o un contratto di un cane acquistato", { name: "nome di chiamata, se scritto, altrimenti \"\"", ped: "nome di pedigree completo", sex: "\"M\" o \"F\"" }],
    anag: ["un passaporto, un pedigree o un contratto di un cane da iscrivere all'anagrafe", { nm: "nome di chiamata", ped: "nome di pedigree", chip: "microchip (solo cifre)", pass: "numero del passaporto", pedn: "numero del pedigree (LOI)", lit: "numero della cucciolata", col: "mantello", seg: "segni particolari", prov: "provenienza (paese e allevamento)", acq: "titolo di acquisizione (es. contratto di compravendita del ...)" }],
    farm: ["un biglietto da visita, una carta intestata o una pagina con i dati di un allevamento", { name: "nome dell'allevamento senza la parola Allevamento", first: "nome del titolare", last: "cognome del titolare", street: "via", num: "numero civico", cap: "CAP", city: "comune", prov: "sigla della provincia", provName: "provincia per esteso", phone: "telefono senza +39", email: "email", site: "sito senza https://", breed: "razza", since: "anno da cui alleva" }],
    enti: ["una lettera, un'email o una pagina della delegazione ENCI o dell'anagrafe canina", { deleg: "delegazione ENCI (città)", email: "email della delegazione", who: "persona di riferimento", wa: "telefono o WhatsApp della delegazione", ana: "email dell'anagrafe canina" }]
   };
   const K = CK[p.kind];
   if (!K) return json({ ok: false, error: "Modulo sconosciuto." });
   const P = (Array.isArray(p.pages) ? p.pages : []).slice(0, 6), content = [];
   for (const x of P) {
    const data = String(x && x.data || "").replace(/^data:[^,]*,/, ""), media = String(x && x.media || "image/jpeg");
    if (!data) continue;
    content.push(media === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
     : { type: "image", source: { type: "base64", media_type: /^image\/(jpeg|png|gif|webp)$/.test(media) ? media : "image/jpeg", data } });
   }
   if (!content.length) return json({ ok: false, error: "Manca la foto o il documento." });
   content.push({ type: "text", text: `Oggi è il ${new Date().toISOString().slice(0, 10)}.` + (p.ctx ? " Contesto: " + String(p.ctx).slice(0, 400) : "") });
   const o = await ask(env, `Leggi ${K[0]}. Può essere una foto o un PDF: trattali allo stesso modo. Leggi TUTTO quello che c'è scritto e compila i campi qui sotto SOLO con quello che c'è scritto, senza inventare: se un dato manca metti "". Le date scritte a mano sono di solito GG/MM/AAAA europeo: rispondi sempre AAAA-MM-GG.
Rispondi con {"f":{...},"note":""} dove "f" ha questi campi:
${Object.entries(K[1]).map(([k, d]) => `- "${k}": ${d}`).join("\n")}
"note": una frase in italiano su quello che non hai potuto leggere bene, altrimenti "".`, content, p.kind === "ped" ? 3000 : 1600);
   const F = o.f && typeof o.f === "object" ? o.f : {}, out = {};
   const D8 = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "", S = (v, n) => typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, n || 200) : "";
   const tree = (t, lv) => { if (!t || typeof t !== "object" || lv > 4) return null; const r = { name: S(t.name, 120), loi: S(t.loi, 40) }; const s = tree(t.s, lv + 1), d = tree(t.d, lv + 1); if (s) r.s = s; if (d) r.d = d; return r.name || r.s || r.d ? r : null; };
   for (const k of Object.keys(K[1])) {
    const v = F[k];
    if (k === "tree") out.tree = tree(v, 0) || {};
    else if (k === "pups" && p.kind === "nasc") out.pups = (Array.isArray(v) ? v : []).slice(0, 20).map(x => ({ time: /^\d{1,2}[:.]\d{2}$/.test(String(x && x.time || "")) ? String(x.time).replace(".", ":").padStart(5, "0") : "", collar: S(x && x.collar, 30), sex: /^[MF]$/.test(String(x && x.sex || "")) ? x.sex : "", g: +String(x && x.g || "").replace(",", ".") || 0 }));
    else if (k === "pups" && p.kind === "w") out.pups = (Array.isArray(v) ? v : []).slice(0, 20).map(x => ({ name: S(x && x.name, 40), g: +String(x && x.g || "").replace(",", ".") || 0 })).filter(x => x.name && x.g > 0);
    else if (k === "titles" && p.kind === "sh") out.titles = (Array.isArray(v) ? v : String(v || "").split(/[,;]/)).map(x => S(x, 30)).filter(Boolean).slice(0, 12);
    else if (/^(birth|bdate|date)$/.test(k)) out[k] = D8(v);
    else if (k === "text") out[k] = S(v, 3000);
    else out[k] = S(v);
   }
   if (!Object.values(out).some(v => v && (typeof v !== "object" || Object.keys(v).length))) return json({ ok: false, error: "Non riesco a leggere niente di utile. Prova con una foto più nitida, dritta e con più luce." + (o.note ? " " + S(o.note, 200) : "") });
   return json({ ok: true, f: out, note: S(o.note, 300) });
  }
  // Libretto sanitario (25/10/2026): legge le foto delle pagine e restituisce vaccini e trattamenti da controllare
  if (task === "libretto") {
   const P = (Array.isArray(p.pages) ? p.pages : []).slice(0, 8), content = [];
   for (const x of P) {
    const data = String(x && x.data || "").replace(/^data:[^,]*,/, ""), media = String(x && x.media || "image/jpeg");
    if (!data) continue;
    content.push(media === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
     : { type: "image", source: { type: "base64", media_type: /^image\/(jpeg|png|gif|webp)$/.test(media) ? media : "image/jpeg", data } });
   }
   if (!content.length) return json({ ok: false, error: "Manca la foto del libretto." });
   const dg = p.dog || {};
   content.push({ type: "text", text: `Cane: ${String(dg.name || "").slice(0, 80)}${dg.birth ? ", nato il " + String(dg.birth).slice(0, 10) : ""}. Oggi è il ${new Date().toISOString().slice(0, 10)}.` });
   const o = await ask(env, `Leggi le pagine del libretto sanitario (o passaporto europeo) di un cane, in qualsiasi lingua. Leggi TUTTO ed estrai ogni vaccinazione e trattamento registrato, con la sua data. Scrivi SOLO quello che c'è, senza inventare: se la data non si legge con sicurezza non mettere la voce e dillo in "unread".
Rispondi con {"items":[...],"unread":""} dove ogni voce ha:
- "t": "vacc" (vaccino polivalente o altro vaccino: cimurro, parvovirosi, epatite, leptospirosi, tosse dei canili, ecc.), "rab" (antirabbica), "vle" (vaccino contro la leishmania: LetiFend, CaniLeish, ecc.), "ple" (prevenzione leishmania con collare o spot repellente: Scalibor, Seresto, Advantix, ecc. se scritto come leishmania), "pfi" (prevenzione filaria: Cardotek, Milbemax se indicato per filaria, Nexgard Spectra, iniezione ProHeart, ecc.), "pz" (pulci e zecche: Bravecto, Nexgard, Simparica, Frontline, ecc.), "verm" (vermifugo / sverminazione: Drontal, Milbemax, Panacur, ecc.).
- "date": data del trattamento AAAA-MM-GG (le date scritte a mano sono di solito GG/MM/AA europeo).
- "prod": nome del prodotto come scritto sull'etichetta o a mano (es. "Nobivac DHPPi + L4"), o "".
- "next": data del prossimo richiamo o della prossima dose SE scritta sul libretto (AAAA-MM-GG), altrimenti "".
- "note": breve nota in italiano solo se utile (es. "valida 3 anni scritto sul libretto"), altrimenti "".
Un vaccino che copre più malattie è UNA voce. Un prodotto contro pulci, zecche e filaria insieme: usa "pfi" se il libretto lo indica per la filaria, altrimenti "pz".
"unread": una frase in italiano su righe che non riesci a leggere bene, altrimenti "".`, content, 3000);
   const D8 = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "", T = ["vacc", "rab", "vle", "ple", "pfi", "pz", "verm"];
   const items = (Array.isArray(o.items) ? o.items : []).slice(0, 80).map(x => ({ t: T.includes(x.t) ? x.t : "", date: D8(x.date), prod: String(x.prod || "").slice(0, 120), next: D8(x.next), note: String(x.note || "").slice(0, 160) })).filter(x => x.t && x.date);
   if (!items.length) return json({ ok: false, error: "Non trovo vaccini o trattamenti da leggere. Prova con una foto più nitida, una pagina per foto." + (o.unread ? " " + String(o.unread).slice(0, 200) : "") });
   return json({ ok: true, items, unread: String(o.unread || "").slice(0, 300) });
  }
    if (task === "expo") {
   const content = [];
   if (p.url) {
    let u;
    try {
     u = new URL(String(p.url));
    } catch (e) {}
    if (!u || !/^https?:$/.test(u.protocol)) return json({
     ok: false,
     error: "Il link non \xe8 valido."
    });
    const r = await fetch(u.toString(), {
     headers: {
      "user-agent": "Mozilla/5.0 (gestionale-allevamento)",
      accept: "text/html,*/*"
     },
     redirect: "follow"
    }).catch(() => null);
    if (!r || !r.ok) return json({
     ok: false,
     error: "Non riesco ad aprire la pagina" + (r ? " (" + r.status + ")" : "") + ". Prova con uno screenshot."
    });
    const html = (await r.text()).slice(0, 4e5);
    const txt = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 3e4);
    if (txt.length < 40) return json({
     ok: false,
     error: "La pagina non ha testo da leggere. Prova con uno screenshot."
    });
    content.push({
     type: "text",
     text: "Pagina " + u.toString() + ":\n" + txt
    });
   } else if (p.data) {
    const data = String(p.data).replace(/^data:[^,]*,/, ""), media = p.media || "image/jpeg";
    content.push(media === "application/pdf" ? {
     type: "document",
     source: {
      type: "base64",
      media_type: "application/pdf",
      data: data
     }
    } : {
     type: "image",
     source: {
      type: "base64",
      media_type: /^image\/(jpeg|png|gif|webp)$/.test(media) ? media : "image/jpeg",
      data: data
     }
    });
   } else if (p.text) content.push({
    type: "text",
    text: String(p.text).slice(0, 2e4)
   }); else return json({
    ok: false,
    error: "Manca il volantino o il link."
   });
   content.push({
    type: "text",
    text: `Oggi \xe8 il ${(new Date).toISOString().slice(0, 10)}. Razza dell'allevamento: ${F.breed || "non indicata"}.`
   });
   const o = await ask(env, `Leggi il volantino, la locandina o la pagina di una o pi\xf9 esposizioni canine (Italia o estero, in qualsiasi lingua). Estrai SOLO quello che c'\xe8 scritto, senza inventare: se un dato manca lascialo vuoto.\nRispondi con {"shows":[...]} dove ogni esposizione ha:\n- "name": nome in italiano (es. "Esposizione internazionale", "Esposizione nazionale", "Raduno", "Speciale di razza")\n- "city": citt\xe0\n- "country": codice di 2 lettere della nazione (IT, SI, HR, AT, DE, FR, CH, ES, ...)\n- "date", "date2": giorno di inizio e di fine in formato AAAA-MM-GG (date2 vuoto se dura un giorno)\n- "type": uno fra "Internazionale (CACIB)", "Nazionale (CAC)", "Raduno", "Speciale", "Club Show", "Altro"\n- "close1": prima chiusura delle iscrizioni (AAAA-MM-GG) se ce ne sono due, altrimenti vuoto\n- "close": ultima chiusura delle iscrizioni (AAAA-MM-GG)\n- "fee": quota d'iscrizione per il primo cane, con valuta, breve (es. "45 € (1\xaa chiusura 40 €)")\n- "judge": giudice della razza dell'allevamento, se indicato; altrimenti vuoto\n- "link": indirizzo per iscriversi, se scritto\n- "notes": una riga con altre informazioni utili (orari, luogo esatto), facoltativa\nSe un weekend ha due esposizioni diverse, sono due elementi. Se gli anni non sono scritti, usa il prossimo anno in cui la data cade dopo oggi.`, content, 2500);
   const D8 = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "";
   const TP = [ "Internazionale (CACIB)", "Nazionale (CAC)", "Raduno", "Speciale", "Club Show", "Altro" ];
   const shows = (Array.isArray(o.shows) ? o.shows : []).slice(0, 8).map(x => ({
    name: String(x.name || "").slice(0, 120),
    city: String(x.city || "").slice(0, 80),
    country: /^[A-Z]{2}$/.test(String(x.country || "").toUpperCase()) ? String(x.country).toUpperCase() : "IT",
    date: D8(x.date),
    date2: D8(x.date2),
    type: TP.includes(x.type) ? x.type : "Altro",
    close1: D8(x.close1),
    close: D8(x.close),
    fee: String(x.fee || "").slice(0, 80),
    judge: String(x.judge || "").slice(0, 120),
    link: String(x.link || p.url || "").slice(0, 300),
    notes: String(x.notes || "").slice(0, 300)
   })).filter(x => x.date || x.name);
   if (!shows.length) return json({
    ok: false,
    error: "Non trovo un'esposizione da leggere. Prova con una foto pi\xf9 nitida o scrivila tu."
   });
   return json({
    ok: true,
    shows: shows
   });
  }
    if (task === "kcalnome") {
      const q = (String(p.brand || "") + " " + String(p.name || "")).trim().slice(0, 160);
      if (!q) return json({ ok: false, error: "Manca il nome delle crocchette." });
      const o = await ask(env, `Cerca in internet l'energia metabolizzabile di queste crocchette per cani: "${q}". Usa il sito del produttore o negozi seri; preferisci la versione venduta in Italia/Europa.
- "kcal": kcal per 100 g (converti: 3850 kcal/kg = 385; 16,1 MJ/kg = 385). Se trovi solo i componenti analitici (proteina, grassi, fibra, ceneri, umidità), calcola 3,5×proteina + 8,5×grassi + 3,5×(100 − proteina − grassi − fibra − ceneri − umidità) e metti "src":"calcolato".
- "src": "produttore" se il numero è pubblicato, "calcolato" se l'hai calcolato dai componenti.
- "url": la pagina da cui l'hai preso.
- "found": il nome esatto del prodotto trovato.
Se non trovi niente di affidabile: {"kcal":null}. Non inventare.
Formato: {"kcal":null,"src":"","url":"","found":""}`, [{ type: "text", text: q }], 1500, [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }]);
      let k = o.kcal == null || isNaN(+o.kcal) ? null : +o.kcal; if (k && k > 1000) k = k / 10;
      return json({ ok: true, kcal: k && k > 200 && k < 700 ? Math.round(k) : null, src: o.src || "", url: o.url || "", found: o.found || "" });
    }
    if (task === "testmating") {
      const parts = (Array.isArray(p.parts) && p.parts.length ? p.parts : [p.data]).filter(Boolean).slice(0, 6).map(x => String(x).replace(/^data:[^,]*,/, "")), media = p.media || "image/jpeg";
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
