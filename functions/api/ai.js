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
   - "post":     { facts, idea? }           → { text }                          post per gli Aggiornamenti del profilo Google
   - "recensione": { who, stars, text, idea? } → { options:[testo] }  2 ringraziamenti brevi, o 1 risposta con l'idea di Paolo
   - "sito":     { fields:{title,desc,h1,ap}, links:[testo], kw:{it,en,de}, orig } → { en:{…,links}, de:{…,links} }
                 Google → Pagine del sito: traduce in inglese e tedesco i campi cambiati da Paolo in italiano
   Paolo non conosce inglese e tedesco: le traduzioni devono essere fedeli, naturali, senza aggiunte. */
const MODEL = "claude-sonnet-5-5";
const LANGS = { it: "italiano", en: "inglese", de: "tedesco", fr: "francese", es: "spagnolo", sl: "sloveno", hr: "croato", pl: "polacco", nl: "olandese", pt: "portoghese" };
const voice = F => `Scrivi come ${F.person}, allevatore di ${F.breed} a ${F.city} (${F.provName}), allevamento ${F.name}, dal ${F.since}.
Tono: diretto, cordiale, sobrio. Prima persona singolare. Niente titoli o palmarès dei cani ("non tirarsela"), niente parole vuote (passione, amore per la razza, professionalità), niente promesse, niente prezzi, niente pressione commerciale. Frasi brevi. Si firma "${F.first}".`;
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
  // permessi per sezione: ogni compito vale per la sua voce del menu; quelli non elencati solo per l'admin
  const p0 = await request.clone().json().catch(() => ({}));
  const NEED = { in: [["traduci", "attesa", "agenda"], 1], out: [["traduci", "attesa"], 1], risposte: [["traduci", "attesa"], 1], interessato: ["attesa", 2],
    richiesta: ["attesa", 2], agenda: ["agenda", 2], referto: [["cani", "coi"], 2], testmating: ["coi", 2], recensione: ["recensioni", 2], post: ["recensioni", 2], sito: ["recensioni", 2] };
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
    if (task === "post") {
      // Post per la sezione "Aggiornamenti" del profilo Google: una notizia, non una vendita.
      const o = await ask(env, `${voice(F)}
Scrivi un post per la sezione "Aggiornamenti" del profilo Google dell'allevamento, in italiano, partendo SOLO dai fatti che ti do.
Regole: 50-110 parole; una notizia (cosa è successo, cosa si vede nelle foto), con un invito sobrio a leggere il resto sul sito; nessun numero di telefono, email o indirizzo; niente prezzi, nessuna offerta, mai le parole disponibile/disponibili, vendita, clienti, acquisto, prenotazione, caparra; non dire quanti cuccioli ci sono; niente hashtag; al massimo un'emoji; nessun fatto che non sia nei dati.${p.idea ? ` ${F.first} aggiunge: "${String(p.idea).slice(0, 500)}".` : ""}
Formato: {"text":"testo del post"}`, JSON.stringify(p.facts || {}).slice(0, 3000), 700);
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
