# CLAUDE.md – Gestionale Del Piccolo Diavolo

> **REGOLE PER OGNI SESSIONE (07/10/2026, dopo la perdita di un giorno di lavoro):**
> 1. Prima di modificare qualsiasi file, parti dall'ULTIMO commit su GitHub (`git pull`, https://github.com/zonerosse/gestionale-allevamento),
>    mai da uno zip vecchio, da una copia locale o da una versione di un'altra conversazione.
> 2. Prima di consegnare lo zip, esegui `python tools/controlla.py`: deve dire "TUTTO A POSTO" (nessuna funzione, voce del
>    menu o file del server sparisce rispetto a GitHub). Se una cosa va tolta davvero, dillo a Paolo e scrivilo qui.
> 3. Lo zip contiene solo i file toccati, ognuno nella versione completa e aggiornata.
> 4. Il 07/10 il commit "gestionale tikus" (partito da una copia del 05/10) aveva cancellato Agenda, Google, Statistiche del
>    sito, istruzioni, novità e altro: recuperati nel commit "recupero" unendo le due versioni.
>
> **Menu del gestionale (07/10/2026), tutte voci che devono esserci:** ☀️ Oggi (pagina d'apertura) · Cani · Cucciolate · Proprietari · Accoppiamenti ·
> Agenda · Attesa · Google (recensioni e post) · Anagrafe · Traduci · Conti · Scadenze · Statistiche (Allevamento + Sito web) · ⚙️ Account.


Istruzioni per chi (Claude, in chat o in Claude Code) lavora su questo repository.
Leggere tutto prima di proporre o scrivere modifiche.

## Cos'è
Il gestionale dell'allevamento **Del Piccolo Diavolo** (Staffordshire Bull Terrier, Ostellato FE) di Paolo Boldrini:
cani, pedigree a 8 generazioni, COI, cucciolate, proprietari, salute (vaccini, sverminazioni, esami feci),
referti e documenti, profili DNA, pagina privata per ogni proprietario.

- Online: **https://gestionale.delpiccolodiavolo.it** (Cloudflare Pages, progetto `gestionale-allevamento`,
  alias `gestionale-allevamento-gie.pages.dev`).
- Repository pubblico: `zonerosse/gestionale-allevamento`. In locale: `C:\Hugo\gestionale-allevamento`.
- **Nel repository c'è solo il programma, mai dati.** Cani, proprietari, file e link segreti stanno su Cloudflare.

## Architettura
| Pezzo | Dove | Note |
|---|---|---|
| Pagine | `public/index.html` (allevatore), `public/proprietario.html` (proprietario) | HTML/CSS/JS in un file solo, nessun build |
| API | `functions/` (Cloudflare Pages Functions) | |
| Dati | D1 `gestionale-allevamento`, binding **`DB`** | tabelle `store` (riga `id='main'`: tutto il gestionale in JSON + `version`) e `history` (ultimi 200 salvataggi) |
| File | R2 `gestionale-allevamento-file`, binding **`FILES`** | foto e PDF; nei dati compaiono come `/files/<chiave>` |
| Accesso | Cloudflare Access (team `delpiccolodiavolo-site-pages`) | app "gestionale" (solo email di Paolo, One-time PIN) + app bypass su `/p` e `/api/public` |
| Variabili | Pages → Variabili | `POLICY_AUD` (AUD dell'app "Solo Paolo"), `TEAM_DOMAIN` (`https://delpiccolodiavolo-site-pages.cloudflareaccess.com`) |

### API
- `GET/PUT /api/data` – legge/salva tutto il gestionale. PUT con `version`: se non coincide → 409 (conflitto, non sovrascrive).
- `POST /api/upload` – carica foto/PDF in R2, risponde `{url:"/files/<chiave>"}`.
- `GET /files/<chiave>` – file per l'allevatore.
- `POST /api/import` – solo primo avvio (database vuoto).
- `GET /api/public/<token>` – dati della pagina del proprietario (senza login).
- `GET /api/public/<token>/f/<chiave>` – file del proprietario: solo quelli presenti nella sua pagina.
- `GET /p/<token>` – serve `proprietario.html`.

Tutto ciò che non è `/p` o `/api/public` richiede `isAdmin()` in `functions/_lib.js`
(verifica firma del JWT di Access con le chiavi del team + `POLICY_AUD`). Non indebolire mai questo controllo.
`DEV_BYPASS=1` esiste solo per le prove in locale: **mai** come variabile su Cloudflare.

### Pagina del proprietario (`ownerSubset` in `functions/_lib.js`)
Il proprietario vede solo: i suoi cani, gli antenati (per pedigree e COI), i documenti non privati dei suoi cani
e di genitori/nonni, i propri dati di contatto. **Mai**: `notes`, documenti con `private:true`, altri cani,
altri proprietari, token. I percorsi `/files/` vengono riscritti in `/api/public/<token>/f/`.
Proprietari esteri (`lang:"en"`): la pagina deve essere **tutta in inglese** (funzione `T(it,en)`, campi `*_en`).

### Struttura del codice nelle due pagine
`index.html` e `proprietario.html` contengono **lo stesso blocco di codice dell'applicazione**,
da `/* ---------- Utilità ---------- */` fino a prima di:
- `/* ---------- Salvataggio online ---------- */` in `index.html`;
- `/* ---------- Pagina privata del proprietario ---------- */` in `proprietario.html`.
**Ogni modifica a quel blocco va fatta identica nei due file.** CSS: idem (stesso `<style>`).
Il salvataggio online sta in fondo a `index.html`: salva da solo ogni 3 secondi se i dati cambiano;
prima di salvare carica su R2 ogni `data:...;base64,` (foto/PDF nuovi) e lo sostituisce con `/files/...`.

### Modello dei dati (`D`)
- `D.dogs[id]`: `name, nick, sex (M/F), birth, color, color_en, loi, chip, sbt, sire, dam, status
  (fattrice/stallone/casa/prenotato/ceduto/sterilizzata/deceduto), ext (esterno), bred (allevato da Paolo),
  breeder, owner, litter, coiSbt, tests, tests_en, titles, notes, photo,
  health{vacc[],verm[],feci[]}, docs[{title,title_en,date,file,fname,private}], dna{...}`
- `D.owners[id]`: `name, country, phone, email, addr, lang (it/en), notes, token` (link segreto `/p/<token>`)
- `D.litters[id]`: `dam, sire, date, state (nata/pianificata), notes, sbtA`
  - `sbtA` (facoltativo) = analisi SBT del test mating, vale per tutti i cuccioli della cucciolata:
    `{c3,c5,c8 (stringhe con virgola), uniq, max, loss, gens:[[unici,max,ignoti]×8], top:[{name,n,pct}], src, date, pdf}`.
    Si mostra con la grafica "Scala" (`coiScale`): nella scheda di Paolo con la fascia 6–9% e il calcolo Wright,
    nella pagina del proprietario solo numeri.
- `D.matings["sire|dam"]`: `{coiSbt}`

### COI
**Analisi SBT a ogni cucciolata:** Paolo manda a Claude il PDF della simulazione (test mating) di SBTpedigree;
Claude prepara `analisi-sbt-<madre>-x-<padre>.json` = `{"analisiSbt":{"sire":"<nome>","dam":"<nome>","a":{...sbtA, pdf:"data:application/pdf;base64,..."}}}`.
Paolo lo carica con "Importa modifiche": il gestionale trova la cucciolata dai nomi dei genitori (anche pianificata),
chiede conferma e salva `sbtA`; il PDF va su R2 da solo al salvataggio. Il PDF di SBT è un'immagine: i numeri li legge Claude.
Il numero principale è sempre il **COI 8 generazioni di SBTPedigree**, inserito a mano (`coiSbt`).
Il calcolo del gestionale (Wright, 8 generazioni) si mostra sotto, come secondario. Fascia ideale **6–9%**.

## Regole di Paolo (vincolanti)
1. **Modifiche all'interfaccia: sempre prima un'anteprima** HTML autonoma da aprire col doppio clic
   (dati di esempio, oppure una sua "Copia di sicurezza" se la allega). Solo dopo l'approvazione, il codice vero.
2. **Le scelte le fa lui**: nomi, testi, cosa tenere o togliere si presentano come opzioni (A/B…). Si decide al
   posto suo solo se lo chiede.
3. **Non scrive codice a mano**: le modifiche si consegnano pronte in uno zip **`gestionale-*.zip`** da estrarre in
   `C:\Hugo\gestionale-allevamento` (sovrascrivendo), poi `git add . ; git commit -m "..." ; git push`.
   Oppure le applica Claude Code direttamente nella cartella.
4. **Dati di cani e proprietari si cambiano solo da "Modifica" con un "Salva" esplicito**: niente modifiche dirette
   nei campi; "Annulla modifiche" esce senza domande. Le aggiunte (salute, documenti) hanno il loro modulo con Salva.
5. **I dati inseriti non devono mai andare persi**: nessuna modifica al programma deve toccare D1/R2,
   cambiare il formato dei dati in modo incompatibile o richiedere di ricaricare i dati.
   Se serve un nuovo campo: si aggiunge, con valore vuoto di default.
6. **Codici fiscali e documenti d'identità dei proprietari** (regola cambiata da Paolo, ottobre 2026): si tengono nel gestionale
   **solo per Paolo** (`owners[id].cf`, `.doc`, `.bplace`, `.bdate`, `.ids`; i suoi in `settings`): mai nella pagina del proprietario,
   mai a chi consulta (`ownerSubset` manda solo i campi elencati, `viewerData` riduce i proprietari al nome e toglie `settings`).
7. Lingua: italiano, testi semplici e diretti; date `gg/mm/aaaa`; simboli ♂ azzurro / ♀ rosa (icone SVG spesse).
8. Scelte grafiche già fatte: Proprietari raggruppati per cucciolata, gruppi CHIUSI di base (20/10/2026, prima tutti aperti); Cucciolate come linea del tempo
   con foto dei genitori; Salute con bottone siringa fisso;
   Cani → filtro Ceduti raggruppato per cucciolata (dalla più recente, gruppi CHIUSI di base dal 20/10/2026, alfabetico dentro);
   Consanguineità con la grafica "Scala" quando la cucciolata ha l'analisi SBT (pagina proprietario: solo numeri);
   "Copia link" anche nella scheda del cane e nell'elenco proprietari.
   "Scheda della cucciolata" (`litterSheet`, solo allevatore): da Cucciolate e dalla scheda dei genitori; mostra la scala SBT
   e "Su chi cade la consanguineità" = antenati comuni ordinati per peso sul COI Wright (`coiParts`, stessi percorsi di `coi8`).

## Prova in locale (facoltativa)
```
npm i -g wrangler@3
printf "DEV_BYPASS=1\n" > .dev.vars
wrangler d1 execute gestionale-test --local --file=schema.sql
wrangler pages dev public --d1 DB=gestionale-test --r2 FILES=gestionale-test
```
`.dev.vars` è nel `.gitignore`: non deve mai finire su GitHub.

## Da non fare mai
- Mettere dati veri (JSON dei cani, foto, documenti, token) nel repository.
- Togliere o aggirare `isAdmin()`, il controllo di versione del PUT o i filtri di `ownerSubset`.
- Rendere visibili al proprietario note, documenti privati o dati di altri.

## Contratto di cessione (ottobre 2026)
- Testo dei contratti di Paolo (maschio/femmina, scelto dal sesso) in `CT`/`V32`/`C36`/`CL1341` nel blocco comune, con traduzione
  inglese: per i proprietari con `lang:"en"` il contratto è **tutto in inglese**, con in fondo il testo italiano che **fa fede** (scelta di Paolo). Caparra e presa in consegna con
  formula fissa senza importi né date (consegna presso l'allevamento a Ostellato); niente "segni particolari". Punto 1.4 invariato (scelta di Paolo).
- `D.dogs[id].contract = {price, meSig, visible}`: lo compila Paolo nella scheda del cucciolo
  (`contractBox`); quando è `visible` i dati sono bloccati. `D.owners[id].cf` e `.doc` (codice fiscale, documento) precompilano.
- Firma **solo con il dito/mouse** (firma elettronica semplice): niente servizi a pagamento, scelta di Paolo.
- Il proprietario firma dalla sua pagina (`ctOwnerBox`) → `POST /api/public/<token>/contract`: unica scrittura possibile dalla
  pagina del proprietario, una volta sola. Il server ricostruisce le condizioni dai dati di Paolo (il browser non può cambiarle),
  calcola l'impronta SHA-256 e salva nella tabella D1 `contracts` (si crea da sola), **non** nei dati del gestionale.
- `GET /api/contracts` (solo Paolo) → `CONTR`; all'apertura il gestionale crea il PDF firmato (jsPDF da cdnjs) e lo mette nei
  documenti del cucciolo (`docs[].ct = hash`), visibile anche al proprietario.
- Flusso semplificato (scelto da Paolo): nella scheda un solo riquadro a 3 stati (`ctState`: todo → sent → done):
  prezzo + firma + tasto "Firma e manda" (salva e rende visibile insieme); poi "Avvisa su WhatsApp" (wa.me con link),
  "Ritira e correggi"; infine "Firmato" con PDF. Etichetta dello stato nelle righe dell'elenco (`ctBadge`): sempre per i
  prenotati, per gli altri solo se il contratto è iniziato. Il proprietario vede prima i dati, il contratto completo è
  in un riquadro da aprire, la scelta foto/nome è scritta in parole semplici (nel PDF resta il testo del punto 3.6).
- Firma di Paolo salvata una volta sola in `D.settings.sellerSig` (la prima che fa); "Firma e manda" la copia in
  `contract.meSig` di quel contratto. "Cambia firma" vale solo per i contratti futuri.
- Pagina del proprietario: se c'è un contratto da firmare, in cima (sotto il nome) l'avviso rosso "Hai un contratto da firmare"
  con "Firma ora" e **subito sotto il modulo da firmare** (`ctTop`, scelta C di Paolo); dopo la firma in cima resta solo
  una riga verde con il PDF, e il riquadro "firmato" torna in fondo.
- Liberatoria foto (punto 3.6): dopo la firma la scelta si vede nella scheda di Paolo (riga "📷 Foto: …"), in prima pagina
  del contratto (riquadro verde) e al punto 3.6 (voci su righe separate, scelta in grassetto "SCELTA DELL'ACQUIRENTE").

## Antiparassitari e calendario del primo anno (ottobre 2026)
- Salute: due sezioni nuove `health.pz` (Pulci e zecche) e `health.lf` (Leishmania e filaria, con `kind`: ple/pfi/vle/test),
  campi `date, prod, prod_en, next, file`. Anche nell'inserimento rapido (siringa). `HA(d,k)` crea la lista se manca.
- Calendario deciso da Paolo: richiamo vaccino a 3 mesi e annuale a 1 anno; 1° aprile avviso "stagione a rischio";
  antirabbica, leishmania e sverminazione a discrezione del proprietario e del suo veterinario (non in calendario).
  In più le "prossime dosi" che Paolo scrive (vaccini, pz, lf) che cadono nel primo anno. Solo per il proprietario.
- Pagina del proprietario, in cima alla Salute: `calBox` con le scadenze future e il tasto che apre
  `GET /api/public/<token>/cal?dog=<id>` → file .ics con due avvisi per evento (giorno prima 9:00, giorno stesso 9:00).
  La logica delle scadenze è in `calEvents()` (pagina) e in `functions/api/public/[token]/cal.js` (server): tenerle uguali.
  Per Android senza import .ics: link Google Calendar uno per uno.
- Scelta di Paolo: "Pulci e zecche" solo per i cuccioli che cede fino al primo anno di vita (`pupYear`: Frontline spray),
  insieme alla guida per il proprietario; per tutti gli altri cani resta com'era ("Leishmania e filaria" sui suoi cani).
  Ogni sezione compare comunque se ha già delle voci. Il proprietario non riceve un registro ma
  la "Guida al primo anno" con i promemoria: il libretto lo aggiorna il suo veterinario, dopo il primo anno non arriva più nulla.
- Pagina del proprietario larga fino a 1240px su computer e tablet (prima 900px), dati del cane su una riga; telefono invariato.
- Contratto versione `2026-10b`: nuovo punto **4-bis** "Pagamento del saldo e riserva di proprietà" (artt. 1376, 1523, 1460,
  1385 c. 2 c.c.), anche tra le clausole approvate (1341–1342). I contratti hanno `snap.ver`: le voci di `CT` con 4° elemento
  (versione minima) compaiono solo dalla versione indicata in poi (`ctCT`), così i contratti già firmati non cambiano testo.
- Salute a riquadri colorati che si aprono (`details.hs.c-<voce>`): da chiusi mostrano icona, titolo, numero di voci,
  ultima data e prossima scadenza; dentro l'elenco e "Aggiungi". Uguale nella pagina del proprietario (senza "Aggiungi").
  I riquadri aperti restano aperti dopo un aggiornamento (`hsOpen`).
- Colori ovunque (scelta di Paolo): `colorize(root)` dopo ogni render, nei riquadri (sheet) e nella pagina del proprietario
  dà a ogni titolo h2 un'icona e un colore secondo il testo (tabella `CZ`, IT/EN) e una striscia colorata al riquadro sotto.
  Nuove sezioni: aggiungerle a `CZ`.

## Accoppiamenti (ottobre 2026)
- Due tendine: Femmina = fattrici attuali (`mateFemales`: F, non esterne, fattrice o `fattr`, non sterilizzate/decedute);
  Maschio = maschi vivi in archivio (`mateMales`: non deceduti, 1–12 anni, o aggiunti da SBT), in ordine alfabetico,
  divisi "I tuoi maschi"/"Stalloni in archivio". Accanto a ogni maschio il COI con la femmina scelta (`pairCoi`):
  SBT se c'è (analisi della cucciolata o valore inserito), altrimenti Wright solo se antenati inseriti ≥70%, se no
  "COI non affidabile". Pallini: 🟢 6–9% · 🔵 sotto · 🔴 sopra · ⚪ non affidabile.
- Sotto: la coppia (COI, fascia, su chi cade, test genetici, "Pianifica la cucciolata" o "Scheda della cucciolata").
- "Aggiungi un maschio da SBT": `GET /api/sbt?id=` (solo Paolo) prova a leggere nome, nascita e genitori dalla meta
  description della pagina SBT; se SBT blocca, il gestionale chiede solo il nome e salva il link (`sbtAdded:true`).

## Solo consultazione (ottobre 2026)
- Variabile Cloudflare Pages `VIEWERS` = email separate da virgola: chi entra con quelle email (e passa Cloudflare Access)
  è "viewer": `GET /api/data` gli dà `viewerData` (proprietari solo col nome, niente contratti, documenti privati,
  firma) e `role:"viewer"`; PUT dati, upload, contratti, SBT, import rispondono 403. I file (foto, PDF) li può leggere.
- Nell'interfaccia (`RO`): niente scheda Proprietari, niente tasti che modificano (`RO_OK` = azioni permesse:
  aprire, filtrare, simulare accoppiamenti), banner "Solo consultazione", `saveNow` non salva. `roClean()` dopo ogni render.
- Paolo resta "admin" perché la sua email non è in `VIEWERS`.
- Navigazione: `navPush()` alla fine di `render()` mette ogni pagina (tab+cane) nella cronologia del browser; aprire un
  riquadro (`sheet`) aggiunge un passo; il tasto "indietro" chiude prima il riquadro, poi torna alla pagina precedente
  (`popstate`). Le foto (link a immagini) si aprono sopra la pagina (`#lbx`) e si chiudono con la X o con "indietro".
- Pagina del proprietario, Pedigree (scelta A di Paolo): niente albero con le foto, ma le schede di Padre e Madre con la
  loro foto (`d.photo`), LOI, colore, anno e test (`ovParents`) e il riquadro "La cucciolata su SBTpedigree" se la
  cucciolata ha `sbtUrl` (si inserisce dalla Scheda della cucciolata). Anche nella scheda di Paolo: genitori + link SBT, e l'albero a 4 generazioni dentro un riquadro richiudibile (per completare gli antenati).

## Calori, monte e parto previsto (ottobre 2026)
- Solo fattrici di Paolo (`isFattrice`): `d.repro=[{t:"heat"|"prog"|"mating"|"visit",date,val,sire,kind,note}]`, sezione
  "Calori e monte" (`reproHtml`) prima della Salute. In gravidanza (prima monta dopo l'ultimo calore, nessuna cucciolata
  nata dopo, entro 75 giorni): parto previsto = monta + 63, tappe ecografia +25, radiografia +55, cassa parto +56,
  finestra +58→+68. Fuori gravidanza: prossimo calore = ultimo + media degli intervalli (default 180 giorni).
  In Cucciolate la cucciolata pianificata mostra la riga della gravidanza (`pregLine`).
- Il tasto "‹ …" in cima alle schede torna alla pagina da cui si è arrivati (`NAVSTACK` + `history.back()`), con la
  scritta giusta (es. "‹ Cucciolate", "‹ Laran") e lo stesso punto di scorrimento e filtro; se non c'è una pagina
  precedente va all'elenco.
- Le tendine (`details`) dell'elenco restano aperte o chiuse come lasciate (`DOPEN`, chiave tab+cane+filtro+titolo),
  anche tornando indietro; il tasto in alto dice anche il filtro (es. "‹ Prenotati").
- "Calori e monte" è un riquadro a tendina (`details.hs.c-rep`), chiuso: da chiuso mostra "In gravidanza · giorno … ·
  parto previsto …" oppure "Prossimo calore previsto: …".

## Nascita e peso dei cuccioli (ottobre 2026)
- Cucciolata: `l.birth={type,start,note}`; cucciolo: `birthOrder, birthTime, collar (colore), birthWeight, weights:[{date,g}]`.
- Scheda della cucciolata → "Nascita e crescita": tabella, "Modifica la nascita" (`bForm`), "⚖️ Pesata" (`wForm`: tutti i
  cuccioli in una schermata, giorno scelto, differenza dall'ultima pesata, rosso se cala) e grafico (`growthSvg`, linee col
  colore del collarino). Scheda del cucciolo e pagina del proprietario: grafico solo di quel cucciolo (`growthDog`).
- Il grafico compare solo con almeno 3 pesi (nascita compresa): con meno dati non si mostra, né a Paolo né al proprietario.

## Foto settimana per settimana (ottobre 2026)
- Cucciolo: `d.wphotos=[{file,date,cap}]` (sezione "Foto della crescita" nella scheda: "Aggiungi foto", anche più insieme;
  tocco = modifica data/frase o elimina). Cucciolata: `l.gphotos` = foto di gruppo; nella Scheda della cucciolata
  "Foto della cucciolata": scegli più foto e per ognuna il cucciolo o "Tutta la cucciolata" (`wpAssign`).
- Settimana di vita = giorni dalla nascita / 7 + 1 (`weekOf`). Pagina del proprietario: "<nome> settimana per
  settimana" con le sue foto e quelle di gruppo ("Con i fratelli"), dalla più recente; foto a tutto schermo.

## Lista d'attesa (ottobre 2026)
- Scheda del menu "Attesa" (`tab="attesa"`, `waitList`): `D.waitlist=[{id,created,name,email,phone,city,country,sex,exp,note,
  source,litter,status,depDate,dog,lang}]`, divisa per cucciolata (pianificate/nate da poco + "Prossima cucciolata,
  qualsiasi"). Stati: new, contacted, deposit, assigned, dropped. "Assegna un cucciolo" crea il proprietario (con link
  privato) e lo collega al cucciolo come prenotato. Caparra: solo la data.
- Modulo del sito (repo delpiccolodiavolo-hugo, `layouts/partials/prenota.html`): oltre allo script Google manda una copia a
  `POST /api/public/richiesta` (pubblico, solo aggiunta, anti-spam col campo "azienda") → tabella D1 `requests`.
  All'apertura il gestionale legge `GET /api/requests` e aggiunge le nuove come "Nuovo" (`wlSync`, id = rid, mai doppie).

## Lista d'attesa (ottobre 2026)
- `D.waitlist=[{id,created,name,email,phone,city,country,sex,exp,note,source,litter,status,depDate,dog,lang}]`, menu "Attesa".
- Il modulo del sito (`layouts/partials/prenota.html` in `zonerosse/delpiccolodiavolo-hugo`) manda ogni richiesta sia al foglio Google
  (Apps Script) sia a `POST /api/public/richiesta` → tabella D1 `requests`; all'apertura il gestionale le prende (`wlSync`, `GET /api/requests`).
- Le richieste vecchie del foglio Google sono state importate una volta (ottobre 2026) con un file "Importa modifiche" (`patch.waitlist.$add`).

## Passaggio di proprietà e consegna (ottobre 2026)
- Modulo **del Comune di Ostellato** (= modulo regionale ER): scansione in `public/modulo-cessione.jpg` (1240×1754, 150 dpi).
  Scelta di Paolo: si usa il foglio vero del Comune, il gestionale ci scrive sopra dati e firme (`PP_POS`: posizioni in pixel
  dell'immagine a 827×1169 + larghezza utile; il testo si rimpicciolisce da solo se non ci sta).
- Scheda del cucciolo (allevato, con proprietario, non esterno: `ppOn`): riquadro "Passaggio di proprietà" (`ppBox`) →
  "Compila e firma" (`ppForm`): data della cessione (va anche nelle due "Data"), dati dell'acquirente presi dal contratto firmato
  (`CONTR[id].buyer`, se no dal proprietario) e modificabili, luogo e data di nascita dell'acquirente a mano, firma di Paolo
  (quella salvata, `D.settings.sellerSig`) e dell'acquirente **con il dito sul telefono di Paolo alla consegna** (scelta A).
- `ppGo` crea il PDF (jsPDF) e lo mette nei documenti del cucciolo `{title:"Passaggio di proprietà firmato",pp:true,private:false}`:
  **lo vede anche il proprietario** (scelta di Paolo). "Rifai" sostituisce il PDF precedente. `d.pp={date,at}`.
- I dati dell'acquirente scritti nel modulo non si salvano a parte: stanno nel PDF (nascita: da `owners[id].bplace/bdate`).
  I dati di Paolo per il modulo (`D.settings.ppMe={cf,bplace,bdate}`) si scrivono la prima volta; `viewerData` toglie `settings`
  e i documenti `pp`. Fotocopie dei documenti d'identità: fuori dal gestionale (regola 6), le allega Paolo.
- "Consegna" (`kitBox`, solo Paolo): spunte `d.kit=[bool×3]` per `KIT` (Kit puppy Farmina, libretto veterinario, certificato di
  buona salute). Pagina del proprietario: "Cosa ricevi con <nome>" (`kitOwner`), sempre l'elenco completo (scelta C).
- Proprietario: campi `bplace` (luogo di nascita) e `bdate` (data di nascita), nel modulo "Modifica proprietario"; precompilano
  "Nato a / Il" dell'acquirente nel passaggio di proprietà. Non vanno nella pagina del proprietario né a chi consulta.
  "Importa modifiche" con `{nascite:[{dog,name,bplace,bdate}]}` (`importNascite`): trova il proprietario dal nome del cane, se no
  dal suo nome (anche con nome e cognome invertiti), chiede conferma e scrive i due campi.
- `saveOwner` ora **unisce** i campi (`Object.assign`) invece di ricreare il proprietario: prima perdeva `token` (link privato),
  `cf` e `doc` a ogni "Salva proprietario".
- Barra in basso sul telefono: 5 voci su una riga (`repeat(5,minmax(0,1fr))`); lì "Accoppiamenti" si chiama **"Coppie"**
  (scelta B di Paolo), nella barra laterale del computer resta "Accoppiamenti". Nuove sezioni: ripensare la barra.

## Conti delle cucciolate (ottobre 2026, solo Paolo)
- Menu "Conti" (`tab="conti"`, `contiPage`): in cima totali dell'anno (entrate, spese, saldo; anni da scegliere se più d'uno),
  poi le cucciolate di quell'anno (della fattrice di Paolo, non esterne) e "Spese generali". `view` = id cucciolata o `"gen"`.
- Dati: `D.litters[lid].acc={prices:{<id cucciolo>:numero},exp:[{id,date,cat,txt,amt,file}]}`, `D.accGen=[…]` (spese generali).
  Entrate = una riga per cucciolo (`litPups`), prezzo scritto a mano (scelta di Paolo, non dai contratti). Spese con voce
  (`AC_CAT`; nelle Spese generali `AC_GEN`: Crocchette, Vaccini, Visite, Terapie, Altro), descrizione, importo e foto della ricevuta facoltativa (immagine ridotta con `shrink`, o PDF; va su R2 al salvataggio).
  Anno di una cucciolata = data di nascita, se no prima spesa, se no oggi.
- Riservati: `ownerSubset` toglie `acc` dalle cucciolate, `viewerData` toglie `acc` e `accGen`; per chi consulta la voce "Conti"
  non c'è.
- Barra in basso sul telefono: se le voci sono più di 5, le prime 4 + **"Altro"** con menu a tendina per le altre (Attesa, Conti
  e le prossime): scelta di Paolo. Sul computer la barra a sinistra le mostra tutte.
- Tasto indietro: chiudere un riquadro (sheet) lasciava un passo doppio nella cronologia e "‹" sembrava non funzionare; ora il
  passo doppio si salta da solo (`popstate`).

## Documenti d'identità e invio all'anagrafe (ottobre 2026)
- Proprietario: riquadro "Documenti d'identità" nella sua scheda (`idsHtml("o:"+id)`), foto (ridotte con `shrink`) o PDF in
  `owners[id].ids=[{id,title,fname,date,file}]`; quello di Paolo in `settings.myIds` (riquadro nella Scheda della cucciolata).
  "Importa modifiche" con `{documentiIdentita:[{dog,name,files:[{title,fname,file}]}]}` (`importIds`, stessa ricerca di `importNascite`).
- Scheda della cucciolata → "Passaggi di proprietà" (`ppLitBox`): cuccioli con proprietario, stato (firmato / da firmare),
  documenti presenti o no, avviso se manca qualcosa. "Scarica i 2 PDF" / "Prepara l'email all'anagrafe" (`ppPack`): con pdf-lib
  (`public/pdf-lib.min.js`, servito dal gestionale, niente CDN) unisce tutti i passaggi firmati in un PDF e fa un secondo PDF con i
  documenti (Paolo per primo, poi gli acquirenti nello stesso ordine; pagina "non ancora caricato" se manca).
  Sul telefono: `navigator.share` con i 2 PDF e il testo (l'indirizzo viene copiato negli appunti: la condivisione non può
  riempire il destinatario). Sul computer: scarica i 2 PDF e apre `mailto:` con oggetto e testo.
  Indirizzo: `settings.anagrafeEmail`, di base p.toselli@comune.ostellato.fe.it (dal sito del Comune), "cambia" nel riquadro.
- Proprietari stranieri (`lang:"en"`): firmano solo il modulo italiano (scelta di Paolo). In "Compila e firma" c'è il riquadro
  "🇬🇧 For …" con la spiegazione (`PP_WHY`); dopo la firma nei documenti del cucciolo va anche la traduzione inglese
  (`ppEnPdf`, `pp_en:true`, "not to be signed"), visibile al proprietario, non a chi consulta.
- jsPDF si carica con `loadJsPDF()`: prima la funzione si chiamava `jspdf` e lo script di jsPDF la sovrascriveva
  (`window.jspdf`), così dal secondo PDF nella stessa sessione (contratti o passaggi) non funzionava più.
- La firma salvata (`settings.sellerSig`) dopo il salvataggio è un file `/files/…`: per i PDF va passata da `toDataURL`.

## Certificati di iscrizione all'anagrafe (ottobre 2026)
- Il veterinario accreditato iscrive i cuccioli in ARAA e rilascia per ognuno la "Dichiarazione / Certificato di identificazione e
  registrazione" (Comune di Ostellato). Non si mandano all'anagrafe con i passaggi (l'iscrizione l'hanno già).
- Scheda della cucciolata → "Iscrizione all'anagrafe" (`iscBox`): cuccioli con microchip e ✅ Iscritto / Manca il certificato;
  "Carica certificati" (più file) → per ogni file il cucciolo o "Tutta la cucciolata" (`iscSave`). Nei documenti del cucciolo:
  `{title:"Certificato di iscrizione all'anagrafe",isc:true,private:false}`: **li vede il proprietario** (scelta B di Paolo),
  non chi consulta (`viewerData` toglie `isc`).
- "Importa modifiche" con `{certificatiIscrizione:[{name,owner,chip,sex,date,fname,file}]}` (`importIsc`): cerca il cucciolo dal
  microchip, poi dal proprietario, poi dal nome di chiamata nel nome o nel soprannome; scrive il microchip dove manca e avvisa se
  sesso o microchip non tornano.
- "Importa modifiche" con `{aggiungiAlCane:[{chip,name,owner,vacc:[…],docs:[…]}]}` (`importAdd`): aggiunge vaccinazioni
  (`health.vacc`, con `HA`) e documenti al cane trovato come in `importIsc`, senza doppioni (vaccino: data+prodotto; documento: fname).
  Usato per libretti e certificati di buona salute fotografati da Paolo.
- Riquadro "Certificati" (`certHtml`, `isCert`: `isc`, `cert` o titolo che inizia con "Certificat…") prima di "Referti e
  documenti", nella scheda di Paolo e nella pagina del proprietario. "Referti e documenti" non mostra più i certificati né i file
  delle vaccinazioni (restano in Salute → Vaccinazioni; scelta A di Paolo); sverminazioni ed esami delle feci con file sì.

## Spese per l'espatrio (ottobre 2026)
- Solo per i cuccioli che vanno all'estero (`abOn`: allevati, con proprietario `lang:"en"`): nella scheda di Paolo, sotto il
  contratto, riquadro "Spese per l'espatrio" (`abroadBox`) con la frase "Costi aggiuntivi per l'espatrio a parte, da quantificare
  man mano…"; il proprietario la vede in inglese nella sua pagina ("Costs for taking <nome> abroad", `abroadOwner`).
  Scelte di Paolo: solo la frase (niente elenco di importi), visibile anche al proprietario, solo per chi va all'estero.
- `d.abroad={it,en}` solo se Paolo cambia la frase ("Modifica la frase", `abEdit`/`abSave`); se manca valgono le frasi di base (`abTxt`).
- LOI mancante sui cani allevati da Paolo (non esterni): nella scheda "In attesa N. LOI" (si tocca per inserirlo, come prima);
  nella pagina del proprietario "In attesa N. LOI" / in inglese "Pending – available after ENCI registration". Appena si scrive il
  numero in Modifica, compare quello.

## Link ai proprietari (ottobre 2026)
- Scheda della cucciolata → "Link ai proprietari" (`linkBox`): per ogni cucciolo con proprietario i bottoni **WhatsApp** (wa.me con
  il numero e il messaggio già scritto), **Email** (mailto con oggetto e testo) e "Copia link"; messaggio in inglese per i proprietari
  `lang:"en"` (`lkMsg`). Dopo l'invio `owners[id].linkSent` = data → "✔ mandato il …". Scelte A B A di Paolo.
  Numero: `lkPhone` (toglie + e 00, aggiunge 39 ai numeri italiani senza prefisso). Bottone disattivato se manca telefono o email.

## Visualizza / Scarica (ottobre 2026)
- Ogni file (voci di Salute, Certificati, Referti e documenti, referto DNA, documenti d'identità, certificati di iscrizione,
  passaggio di proprietà) ha due bottoni (`fBtns`): **Visualizza** (foto sopra la pagina con `#lbx`, PDF in una scheda) e
  **Scarica** (`class="fb-dl"`, con `download`; il visualizzatore di foto la lascia passare). Anche nella pagina del proprietario
  ("View" / "Download"). Scelta B di Paolo. Prima i link scaricavano soltanto.
- Chiudere una foto con la X fa `history.back()`: `LB_BACK` fa ignorare quel `popstate`, altrimenti la regola del passo doppio
  riportava alla pagina precedente.
- Testi delle firme (scelta di Paolo): ovunque si firma c'è scritto "col dito dal telefono, col mouse dal computer" (contratto per
  Paolo e per il proprietario, prima e seconda firma, passaggio di proprietà, messaggio WhatsApp del contratto; in inglese "with your
  finger on a phone, with the mouse on a computer"). La frase nel PDF dei contratti firmati ("firma con il dito") non è cambiata.

## Esposizioni (punto 7, ottobre 2026)
- Scheda di ogni cane → "Esposizioni" (`showsBox`), prima di "Titoli": riepilogo (uscite, CAC, CACIB, BOB, Eccellente), una scheda per
  esposizione (`shCard`) con data, tipo, nome e luogo, giudice, classe, qualifica, classifica, titoli presi, giudizio scritto e foto
  del giudizio (Visualizza/Scarica). "＋ Aggiungi esposizione" / "Modifica" (`shForm`, elenchi `SH_TP`, `SH_CL`, `SH_Q`, `SH_TI`).
- `d.shows=[{id,date,type,name,judge,cls,qual,rank,titles,text,file,fname,own,web,inSite}]`. Due interruttori per esposizione:
  **Proprietario** (`own`, parte spento: scelta di Paolo) e **Sul sito** (`web`). I titoli presi compaiono anche in "Titoli" (`shTitles`).
- Proprietario: `showsOwner` mostra solo quelle `own` (in inglese per i proprietari stranieri, `SH_EN`); `ownerSubset` gli manda solo
  quelle (`o.shows.filter(x=>x.own)`).
- Sito: `GET /api/public/esposizioni` (functions/api/public/esposizioni.js) → risultati `web` senza giudizio né foto, CORS per
  delpiccolodiavolo.it, cache 60 s. "🌐 Prepara per il sito" (`shPrep`, nel riquadro di ogni cane) scarica
  `delpiccolodiavolo-esposizioni.zip` con `data/esposizioni.json` (zip fatto in casa, `zipStore`) e segna `inSite`.
  Il sito mostra i risultati nel Palmarès e sotto ogni cane in Femmine/Maschi (vedi CLAUDE.md del repository del sito).

## Scadenze (punto 8, ottobre 2026)
- Voce "Scadenze" (`tab="scadenze"`, sul telefono in Altro; non per chi consulta): tutte le cose da fare in ordine di data,
  gruppi Scadute / Questa settimana / Prossimi 30 giorni / Più avanti, filtri Salute, Calori e parti, Cuccioli, Esposizioni.
  Tocco su una riga → scheda del cane. Calcolo in `scEvents()`:
  - Salute dei cani di Paolo (`scMine`: non esterni, senza proprietario, non ceduti/deceduti) e dei cuccioli ancora prenotati
    (`scPup`, ≤ 180 giorni): voci con data futura, "prossima dose" (`next`), e per i cani di Paolo le date **suggerite** (scelta B),
    con le regole di Paolo: **vaccino** (ultimo + 365) e **vaccino leishmania** (`lf` tipo `vle`, + 365) solo per i cani "attivi"
    = fattrici (`isFattrice`) o con un'esposizione negli ultimi 12 mesi o in programma (i cani anziani, sterilizzati, a casa non si
    vaccinano); **prevenzione leishmania mai** (a Ferrara non c'è); **prevenzione filaria** (`pfi`, NexGard Spectra) e pulci/zecche
    ultima + 30 solo se cade tra aprile e novembre; vermifugo ultimo + 90. Leishmania e filaria si ragionano per tipo
    (chiavi `lf:pfi`, `lf:vle` in `scSkip`/`scMove`).
  - Cuccioli prenotati: richiamo del vaccino a 3 mesi (sparisce con un vaccino dal 70° giorno). Nessuna consegna (scelta di Paolo).
    Le scadenze uguali dei cuccioli della stessa cucciolata diventano una riga ("8 cuccioli Billy × Black Jack").
  - Fattrici (`reproState`): parto previsto (monta + 63) e tappe (ecografia +25, radiografia +55, cassa parto +56), oppure
    prossimo calore previsto. Esposizioni con data da oggi in poi.
  - Una scadenza passata resta finché non si registra la cosa fatta (scelta B): `scDone` = voce dello stesso tipo con data da 7
    giorni prima della scadenza in poi; il calore e il parto si aggiornano da soli con un nuovo calore o la cucciolata nata.
- Telefono: "Aggiungi al telefono" (`scPhone`) crea `settings.calToken` e mostra il link `/api/public/scadenze/<token>.ics`
  (iPhone: `webcal://`; Google: "Da URL"). `functions/api/public/scadenze/[token].js` serve `settings.scad`, che `scSync()`
  riscrive a ogni salvataggio e all'apertura del gestionale. Avviso alle 9 del giorno prima.
- Aggiungere e togliere dalle Scadenze (scelte B A di Paolo): "＋ Aggiungi scadenza" (`scAddF`/`scAdd`): cane (o "Tutti i cuccioli
  …", o nessun cane = promemoria dell'allevamento in `settings.todo`), tipo, data, descrizione. Vaccino/vermifugo/antiparassitari
  → `d.todo=[{id,k,date,text}]` (in Salute compare "📌 In programma", `scPlanned`); Esposizione → nuova voce in `d.shows`;
  Altro → promemoria (`k:"memo"`).
- Tocco su una scadenza (`scAct`): **Fatto…** apre il modulo della Salute già compilato (stesso prodotto dell'ultima volta o del
  promemoria; per i cuccioli spunta "tutta la cucciolata"); al salvataggio `scAfterDone` toglie il promemoria. **Sposta la data**
  (`scMove`: voce futura, prossima dose, suggerita → `d.scMove`, richiamo dei cuccioli, esposizione, promemoria). **Non serve**
  sulle suggerite → `d.scSkip[tipo]=true`, non torna più per quel cane (in fondo alla pagina "Suggerimenti tolti" → Riattiva).
  **Elimina** per quelle scritte da Paolo. Calore e parto si cambiano solo da "Calori e monte".

## Regole ENCI (punto 9, ottobre 2026)
- Fonte: Norme tecniche del Libro genealogico in vigore dal 1/9/2023 (DM 116130 del 22/2/2023) + codice etico ENCI. Paolo ha scelto
  limiti più prudenti: **18 mesi** di età al parto e **180 giorni** tra due parti (`EN_AGE`, `EN_GAP`); l'ENCI chiede 16 mesi e 170 giorni.
- `enciCheck(fattrice, maschio, dataMonta)` → righe 🟢 ok / 🟠 warn / 🔴 bad / ℹ️ info: età al parto (monta + 63), giorni dall'ultimo
  parto, numero di cucciolate (certificato veterinario di idoneità prima della monta dai 7 anni o con già 5 cucciolate; codice
  etico: massimo 5), parentele vietate (genitore/figlio, fratelli pieni, mezzi fratelli), 2° calore (dai calori in "Calori e monte").
- Dove: **Accoppiamenti** (riquadro "📋 Regole ENCI" con la data di monta ipotizzata, `MATE_DT`; di base la monta in corso, il
  prossimo calore + 12 giorni o oggi + 30), **scheda della fattrice** dentro "Calori e monte" (`enciFattr`: età, cucciolate, prossimo
  parto possibile, certificato), **cucciolate pianificate** (`enciLitLine`, con la monta in corso o "se la monta fosse oggi"),
  **Scadenze**: Modello A (nascita + 25) e Modello B (nascita + 90) per le cucciolate nate negli ultimi 180 giorni; "Fatto:
  consegnato oggi" scrive `l.enciA` / `l.enciB`.
- Accoppiamenti: i maschi **non permessi dall'ENCI** per parentela con la fattrice (`enciRel`: genitore/figlio, fratelli pieni, mezzi
  fratelli) non compaiono nell'elenco "Maschio"; una riga dice quanti sono, con "mostrali" (`MATE_NO`) che li mette in fondo nel
  gruppo "🚫 Non permessi dall'ENCI" con il motivo. Nessun filtro sul COI (l'ENCI non ha limiti di COI; restano i colori). Scelte A A.

## Copie di sicurezza automatiche (punto 11, ottobre 2026)
- Tabella D1 `daily` (si crea da sola, `ensureDaily`): al **primo salvataggio di ogni giorno** (giorno italiano) `PUT /api/data`
  mette da parte com'era il gestionale **prima** di quel salvataggio (`dailyCopy`); si tengono **90 giorni** (scelta di Paolo).
  Resta anche la tabella `history` (ultimi 200 salvataggi).
- "Copia di sicurezza" nella fascia in alto apre il riquadro **💾 Copie di sicurezza** (`bkSheet`): "Scarica una copia adesso"
  (scrive `settings.lastDl`) e l'elenco delle copie automatiche (`GET /api/backups`) con **Scarica** (`?day=`) e **Ripristina**
  (`POST /api/backups {day}`: prima salva la situazione attuale come copia "prima del ripristino", poi sostituisce i dati e la
  pagina si ricarica). Solo Paolo (`isAdmin`). Foto e documenti restano su R2: la copia contiene i dati e i collegamenti.
- Scadenze: una volta a settimana "Scarica la copia di sicurezza sul computer" (`src:"bk"`, `settings.lastDl` + 7 giorni);
  "Fatto" la scarica subito.

## Cucciolate sul sito (punto 10, ottobre 2026)
- Scheda della cucciolata → "Sul sito" (`cuBox`): interruttore `l.web` e "🌐 Prepara per il sito" (`cuPrep`): zip
  `delpiccolodiavolo-cucciolate.zip` con `data/cucciolate.json` e le foto dei genitori in `static/images/cucciolate/`; segna `l.inSite`.
- `GET /api/public/cucciolate` (functions/api/public/cucciolate.js, `siteLitters` in _lib.js) e `…/cucciolate/f/<chiave>` (solo
  le foto dei genitori delle cucciolate "Sul sito"). Sul sito: genitori con foto, test e titoli in IT/EN/DE (`tests_en`, `tests_de`,
  `titles_en`, `titles_de`; se mancano, italiano), genitori dei genitori, SBT; etichetta Disponibili (c'è un cucciolo senza
  proprietario e senza stato prenotato/ceduto/deceduto/in casa) / Non disponibili / In programma; numero di cuccioli. Mai note né
  proprietari; niente cuccioli singoli né prenotazioni (scelte di Paolo). `cuItems()` nella pagina = stessa logica di `siteLitters()`.
- Finestre (`.sheet`): sul computer larghe fino a 880 px (94% dello schermo); i campi dei moduli si stringono (`min-width:0`,
  `width:100%`) invece di far scorrere la finestra di lato (prima un elenco con nomi lunghi la allargava e tagliava i campi).
- "Importa modifiche" con `{coiTestMating:[{sire:{sbt,name},dam:{sbt,name},coi:"16,139"}]}`: trova i cani dal numero SBT (o dal
  nome) e scrive `D.matings["maschio|femmina"].coiSbt`, come la casella "COI SBT del test mating" in Accoppiamenti.

## Statistiche, richiesta di recensione, accesso di Daniela (ottobre 2026)
- **Statistiche** (`tab="statistiche"`, nel menu sotto Scadenze; non per chi consulta): cucciolate nate, cuccioli, media, maschi/
  femmine; tabelle per cucciolata, per fattrice, per stallone (`stPage`); titoli ed esposizioni dei cani allevati. Le cucciolate
  senza schede dei cuccioli: "Scrivi quanti" → `l.bornM` / `l.bornF` (`stLit`; scelta A di Paolo).
- **Recensione**: in "Link ai proprietari" il bottone "⭐ Chiedi recensione" (`lkRev`): WhatsApp (o email) con il link
  https://delpiccolodiavolo.it/chiedi-recensione/ (italiano/inglese), segna `owners[id].revAsked`. In Scadenze "Chiedi la recensione
  alle famiglie" a nascita + 88 giorni (60 + 4 settimane) per le cucciolate degli ultimi 180 giorni, finché non è chiesta a tutti o
  "Fatto" (`l.revDone`).
- **Ruolo "conti"** (Daniela, veronesi.daniela73@gmail.com): variabile Cloudflare Pages `CONTI` = email separate da virgola (e la
  stessa email nella policy di Cloudflare Access dell'app "gestionale"). `GET /api/data` le dà `contiData` (cucciolate con
  genitori, data, stato e `acc`; nomi di cuccioli e genitori; `accGen`; niente proprietari, note, documenti, impostazioni) e
  `role:"conti"`; `PUT /api/data` salva solo i Conti (`mergeConti`: `litters[*].acc` e `accGen`, il resto resta quello vero);
  `/api/upload` permesso (ricevute). Nella pagina (`CONTI`) c'è solo la voce Conti, senza Copia di sicurezza/Importa.
- Nome di chiamata in rilievo (stile C scelto da Paolo): sotto il nome nella scheda di Paolo e nella pagina del proprietario
  (`.nick-c`, grassetto colorato più grande) e nell'elenco Cani (`.nick-l`). Per i cuccioli è il nome dato dai proprietari
  (Rocco, Batman, Raya, Luce, Yuky); niente campo "aka".

## Modello B ENCI (ottobre 2026)
- `public/modello-b.pdf` = modulo originale ENCI F-7234_09 (4 fogli: dati + 12 cuccioli). I suoi campi sono difettosi (fogli 3 e 4
  con gli stessi nomi), quindi si tolgono campi e annotazioni e si scrive sopra con pdf-lib alle posizioni `MB_POS` (p0 = foglio 1,
  slots = 12 cuccioli). `mbBuild(lid)`: allevatore (Paolo, CF da `settings.ppMe`), razza, data di nascita, fattrice e stallone (LOI
  "LO…" → ROI, microchip a caselle), proprietario dello stallone (dalla scheda o dalle note "Proprietaria: …", modificabile),
  cuccioli (prima i maschi) con nome, sesso, microchip, mantello e dati del nuovo proprietario (indirizzo letto da `mbAddr`),
  totale fogli 4, data, consensi presto/presto/nego, firma di Paolo (`settings.sellerSig`) sulle due righe del foglio 1 e su
  "Firma dell'allevatore" del foglio 4. "Somma €" e "L'allevatore è" restano vuoti salvo scelta nella finestra (`l.modB.status`).
- Finestra `mbForm`: controllo dei dati mancanti (`mbCheck`), Visualizza / Scarica / Invia per email / WhatsApp (sul telefono
  condivisione con il PDF allegato; sul computer scarica + mailto o wa.me) / ✔ Consegnato (`l.enciB`). Email e WhatsApp di
  destinazione in `settings.modB`.
- **Riquadro colorato in alto** (`mbBanners`) per le cucciolate nate da ≤ 120 giorni senza Modello B consegnato: nella prima pagina
  (Cani), in cima a Scadenze e in cima alla Scheda della cucciolata. Blu > 30 giorni, arancione 15–30, rosso < 15 o scaduto; barra
  dei 90 giorni. Anche la scadenza "ENCI Modello B" ha il bottone "📄 Prepara il Modello B".
- **Conto alla rovescia del Modello B sul telefono**: finché `l.enciB` è vuoto, `scEvents` aggiunge eventi `src:"mbcd"` (solo per il
  calendario, `phone:true`, non compaiono nella pagina Scadenze) ogni 4 giorni a ritroso dalla scadenza (nascita + 90) a partire da oggi,
  il giorno della scadenza e poi ogni 4 giorni per 4 settimane se è scaduto: "📄 Modello B ENCI: mancano N giorni". Con `al:"9"`
  il calendario avvisa alle 9 del giorno stesso (`TRIGGER:PT9H`), invece che il giorno prima.
- Codice a barre del microchip (scelta B di Paolo): `mbBarcode` disegna un Code 128 (`c128`, set C per le coppie di cifre) del
  numero di microchip nel riquadro "Spazio riservato alla applicazione del codice a barre" di ogni cucciolo (`MB_BOX`), con il
  numero sotto. Verificato con un lettore: si legge uguale al numero. Con il codice a barre le caselle "microchip N°" del cucciolo
  restano vuote, come chiede il modulo ("Non compilare in caso di applicazione etichetta codice a barre"); si compilano solo se
  il microchip manca o è troppo corto. Le caselle del microchip di fattrice e stallone si compilano sempre.


## Allarme sul telefono voce per voce (ottobre 2026)
- In Scadenze ogni riga ha il campanello 🔔 (`scBell`): chiede quando avvisare (scelta A di Paolo: il giorno prima alle 9, il giorno
  stesso alle 9, tutte e due), salva `settings.alarms[id]`, salva i dati e apre
  `/api/public/scadenze/<calToken>/ev?id=…&al=prima|giorno|tutte` (functions/api/public/scadenze/[token]/ev.js): un file .ics con un
  solo evento, che l'iPhone apre nel Calendario ("Aggiungi"). Campanello giallo + "🔔 sul telefono" se già messa.
  In alto resta "Aggiungi tutto al telefono" (abbonamento a tutto il calendario): usando tutti e due i modi gli eventi si doppiano.
- **Preavviso e ripetizione per ogni voce** (scelta A di Paolo, solo per quella voce): nel campanello si sceglie "Primo avviso"
  (il giorno stesso, 1, 3, 7, 14, 20, 30 giorni prima o un numero) e "Poi ripeti ogni" (mai, 1, 2, 3, 4, 7 giorni); la finestra mostra
  l'elenco degli avvisi. `settings.alarms[id]={pre,every}` (`alCfg`, `alDates`); ogni avviso è un evento a sé alle 9 ("⏰ …: mancano N
  giorni"), perché l'iPhone tiene al massimo due avvisi per evento. Vale per il campanello (`ev?id=&pre=&every=`) e per "Aggiungi
  tutto" (`scSync`). Se il Modello B ha un'impostazione sua, sostituisce il conto alla rovescia automatico ogni 4 giorni.

## Salva in Drive (ottobre 2026)
- Google Cloud: progetto `staffordshire-bull-terrier`, Google Drive API attivata, client OAuth web
  `1051634257234-j2bpevh0giietep68ntut2ece36usaf5.apps.googleusercontent.com` con origine `https://gestionale.delpiccolodiavolo.it`
  (`DRIVE_CLIENT`). Permesso `drive.file`: il gestionale vede solo i file che crea lui. Accesso con Google Identity Services
  (https://accounts.google.com/gsi/client), token in memoria (1 ora).
- Scheda della cucciolata → "Google Drive" (`drBox`) → "☁️ Salva in Drive" (`drSave`, solo col bottone: scelta A). Tutti i documenti
  (scelta di Paolo): contratti firmati, passaggi di proprietà (anche traduzione inglese), certificati di iscrizione, documenti
  d'identità dei proprietari, Modello B (rifatto e aggiornato ogni volta). Cartelle A e B: originale in
  "Del Piccolo Diavolo – Documenti/<AAAA-MM> <madre> × <padre>/<cucciolo> (<proprietario>)/", collegamento (shortcut) nelle cartelle
  per tipo. `settings.drive={folders,files}`: un file già salvato e non cambiato non si ricarica.

## Caparra e ricevuta (ottobre 2026)
- Bottoni del riquadro Caparra (scelta di Paolo): solo "💾 Salva" (prepara e salva la ricevuta tra i documenti privati del cucciolo,
  da lì Visualizza/Scarica) e "WhatsApp". Niente Visualizza/Scarica/Email nel riquadro.
- Interruttore "Condividi con il proprietario" sotto i bottoni (quando la ricevuta c'è): di base spento (`private:true`); acceso →
  `depShare:true`, `private:false`, la ricevuta compare nella pagina del proprietario. Rifacendo la ricevuta lo stato resta.
- Scheda del cucciolo (solo Paolo) → "Caparra" (`depBox`): bonifico e/o contanti, ognuno con importo e data; la data dei contanti è facoltativa (`d.dep={bon,cash}`). Rifacendo la ricevuta, quella nuova (con il totale aggiornato) sostituisce la vecchia.
  "Visualizza / Scarica / WhatsApp / Email" (`depGo`) prepara la **ricevuta di caparra confirmatoria** (art. 1385 c.c., come il
  contratto): dati di Paolo e dell'acquirente, totale in cifre e lettere (`numIt`), "di cui € … tramite bonifico il … e € … in
  contanti il …", cucciolo (nome, sesso, nascita, genitori, microchip), "In caso di rinuncia da parte dell'acquirente, la somma
  versata non viene restituita" + eccezione del cucciolo morto o malato (come l'art. 4), firma salvata, "Ricevuta tra privati: non è
  un documento fiscale". Proprietari stranieri (`lang:"en"` oppure paese diverso dall'Italia), scelta A di Paolo: un solo foglio, sopra il testo italiano che fa fede, una riga, sotto la traduzione inglese più piccola in grigio; firma una volta in fondo, nota "non è un documento fiscale" in tutte e due le lingue. La ricevuta va in `d.docs` con `dep:true` e
  **`private:true`** (scelta A di Paolo: NON compare nella pagina del proprietario; se e quando mandarla lo decide lui con WhatsApp/Email)
  e in Drive nella cartella per tipo "Ricevute caparra". Le ricevute fatte prima (private:false) diventano private da sole all apertura del gestionale (`loadAll`).

## PDF fatti con jsPDF: lettere speciali (ottobre 2026)
- I caratteri standard di jsPDF coprono solo l'Europa occidentale: con š, č, ž, ł (es. "Hriberšek", "davčna številka") il testo usciva
  spaziato e fuori pagina. `loadJsPDF()` restituisce un jsPDF "protetto": `text`, `splitTextToSize`, `getTextWidth` ricevono il
  testo senza segni (š→s, č→c, ł→l…). Vale per contratti, passaggi di proprietà (anche la traduzione) e ricevute di caparra.
- Ricevuta: per i proprietari stranieri "codice fiscale estero …" invece di "C.F." (in inglese "tax ID").

## RIEPILOGO DELLE SCELTE DI PAOLO (da rispettare; aggiornato al 3 ottobre 2026)
Regole di lavoro
- Prima di ogni modifica all'interfaccia: anteprima HTML autonoma, poi il codice solo dopo il suo ok. Le scelte le fa Paolo (opzioni
  A/B), Claude decide solo se Paolo lo chiede. Istruzioni semplicissime, percorso esatto; meglio un file da importare che cercare
  nelle schede. Zip del gestionale `gestionale-*.zip`, del sito `delpiccolodiavolo-*.zip`. Messaggi pronti in blocco di codice.
- Ogni zip contiene tutto (sostituisce i precedenti). Dopo Push: 2–3 minuti, poi riaprire il gestionale.
Dati e anagrafe
- Documenti d'identità dei proprietari solo per Paolo. Proprietari stranieri `lang:"en"`: pagina, messaggi e PDF in inglese.
- Nome di chiamata dei cuccioli = quello dato dai proprietari (Rocco, Batman, Raya, Luce, Yuky), in rilievo (stile C); niente "aka".
- LOI mancante dei cani allevati: "In attesa N. LOI". Spese per l'espatrio: solo la frase, visibile anche al proprietario straniero.
- Firma di Paolo (`settings.sellerSig`) su contratti, passaggi di proprietà e Modello B. Firme: "col dito dal telefono, col mouse dal computer".
- File: due bottoni "Visualizza" e "Scarica" ovunque.
Modello B ENCI
- Modulo originale compilato, firmato, 4 fogli sempre (totale fogli 4), consensi presto/presto/nego, "somma €" vuota, "L'allevatore è"
  nessuna casella salvo scelta nella finestra, codice a barre Code 128 del microchip al posto delle caselle del cucciolo.
- Riquadro grande e colorato in alto (prima pagina, Scadenze, Scheda della cucciolata), blu/arancione/rosso secondo i giorni.
- Conto alla rovescia sul telefono: avviso ogni 4 giorni alle 9 fino alla scadenza (e per 4 settimane dopo, se scaduto).
Scadenze e regole
- Date suggerite: vaccino e vaccino leishmania solo per fattrici e cani da expo; prevenzione leishmania mai (a Ferrara non c'è);
  prevenzione filaria (NexGard Spectra) e pulci/zecche ogni mese da aprile a novembre a tutti; vermifugo ogni 3 mesi.
  "Fatto" apre la Salute già compilata; "Non serve" non la suggerisce più per quel cane. Nessuna consegna dei cuccioli in Scadenze.
- Regole ENCI con limiti prudenti di Paolo: 18 mesi di età al parto e 180 giorni tra due parti (ENCI: 16 mesi e 170 giorni);
  avvisi anche del codice etico (2° calore, massimo 5 cucciolate). Maschi non permessi per parentela nascosti in Accoppiamenti
  (con "mostrali"); nessun filtro sul COI (fascia di Paolo 6–9% solo come colori).
- Recensione: bottone "Chiedi recensione" + promemoria 4 settimane dopo i 60 giorni.
- Allarmi sul telefono: per ogni scadenza col campanello 🔔, con giorni di preavviso e ripetizione scelti voce per voce (es. Modello B
  e vaccini con anticipo, perché servono appuntamenti); oppure tutto insieme.
Sito delpiccolodiavolo.it
- Esposizioni: interruttori "Proprietario" (parte spento) e "Sul sito"; sul sito niente giudizi né foto; titoli presi anche in "Titoli".
  Pagine: Palmarès e sotto ogni cane in Femmine/Maschi, IT/EN/DE.
- Cucciolate: solo quelle accese con "Sul sito"; genitori come nel Programma allevamento, etichetta Disponibili/Non disponibili/In
  programma, niente cuccioli singoli, niente prenotazioni né riquadro contatti; test e titoli tradotti in EN/DE (campi `_en`, `_de`).
- Sempre: "in automatico" + "Prepara per il sito" per il testo vero (Google e IA).
- Ricevuta della caparra: "caparra confirmatoria", non restituita in caso di rinuncia; bonifico e contanti anche insieme (data dei
  contanti facoltativa); firma salvata; solo dalla scheda del cucciolo; bottoni Salva e WhatsApp; di base privata, con l'interruttore
  "Condividi con il proprietario" per mostrarla nella sua pagina.
Accessi e copie
- Documenti firmati in Google Drive col bottone "Salva in Drive" (tutti i tipi, cartelle per cucciolata/cucciolo + collegamenti per tipo).
- Daniela (veronesi.daniela73@gmail.com, variabile `CONTI`): vede e modifica solo i Conti.
- Copie di sicurezza automatiche: una al giorno per 90 giorni, Scarica e Ripristina; promemoria settimanale per scaricarla sul computer.
- Statistiche nel menu sotto Scadenze; per le cucciolate senza schede si scrive quanti maschi e femmine sono nati.

## PDF appena creati: Visualizza e Drive (ottobre 2026)
- Ricevute, contratti e passaggi nascono come `data:application/pdf;base64,…` e diventano `/files/…` solo quando `saveNow` li
  carica su R2. Chrome apre i link `data:` con una pagina bianca: un gestore dei clic apre i PDF `data:` come blob.
- `depGo` aspetta il salvataggio e ridisegna; `drSave` prima finisce di salvare, perché `drItems` prende solo i file `/files/`
  (prima la ricevuta appena rifatta veniva saltata e in Drive restava la vecchia).
- Drive (ottobre 2026): le cartelle memorizzate in `settings.drive.folders` si controllano una volta per giro (`drAlive`): se sono
  cestinate o cancellate si ritrovano/ricreano. Un file sostituito (`drUpload` con `oldId`) viene spostato nella cartella del
  cucciolo se stava altrove; il collegamento nella cartella per tipo si rifà se manca.
- Drive: a ogni "Salva in Drive" anche i file già salvati vengono controllati (`drPlace`): il file deve stare nella cartella del
  cucciolo e il collegamento nella cartella per tipo ("Ricevute caparra", "Contratti"…); se manca o è cestinato si rifà, se è
  altrove si sposta. (Caso Maris, 03/10/2026: il collegamento in "Ricevute caparra" mancava.)

## Modello A ENCI (ottobre 2026)
- Modulo originale `public/modello-a.pdf` (F-7233_11, 2 fogli) compilato scrivendo sopra come il B (`maBuild`, posizioni `MA_POS`
  prese dai campi del modulo). Scelta di Paolo: precompilato con i suoi dati (sottoscritto, "controllabile presso", razza,
  Delegazione **Ferrara**, "Non è Socio ENCI", consensi presto/presto/nego, data, firma su foglio 1 e 2). Fattrice, stallone,
  monta (ultima "monta" in Calori e monte prima del parto) e cuccioli si aggiungono da soli quando ci sono. Dati del proprietario
  dello stallone oltre al nome: a mano. Fattrice non sua (es. Queen di Tevini): dati del proprietario e niente firma di Paolo.
- Riquadro "📄 Modello A ENCI" nella Scheda della cucciolata (`maBox`, sotto Google Drive): Visualizza, 💾 Salva (`l.modA.file`,
  `l.modA.saved`; va in Drive nella cartella per tipo "Modelli A"), ✉️ Email a gcferrarese@gmail.com, WhatsApp a Cristina
  338 214 1637 (`MA_TO`). Per la cucciolata di Billy non serve (scelta di Paolo).
- Riquadro "📄 Modello B ENCI" nella Scheda della cucciolata (`mbBox`, sotto quello del Modello A), sempre disponibile anche dopo
  "Consegnato" (sparisce solo l'avviso in alto): Visualizza, 💾 Salva (`l.mbFile`, `l.mbSaved`), Email e WhatsApp alla delegazione
  (se `settings.modB` è vuoto si usano i contatti di Ferrara `MA_TO`), ✏️ Altri dati (`mbForm`), ✔ Consegnato con scadenza.

## Passaggi di proprietà: conferma prima dell'email all'anagrafe (ottobre 2026)
- Indirizzo di base p.toselli@comune.ostellato.fe.it (o `settings.anagrafeEmail` con "cambia"). "✉️ Prepara l'email all'anagrafe"
  apre prima `ppMailAsk`: passaggi che partono (verde) e quelli non firmati che mancano (arancione), campo "Manda a" (un altro
  indirizzo vale solo per quella volta, `PP_TO`), "Sì, prepara l'email" (`ppMailGo` → `ppPack(lid,"mail")`) o Annulla.
- Bottoni "Scarica i 2 PDF" e "Prepara l'email all'anagrafe" sempre attivi (scelta B di Paolo): con 0 passaggi firmati compare
  l'avviso "Nessun passaggio firmato: non c'è ancora niente da mandare. Mancano ancora N passaggi da firmare." (`ppNone`).

## Scheda della cucciolata senza consanguineità (ottobre 2026)
- Scelta di Paolo: nella Scheda della cucciolata (`litterSheet`) della consanguineità resta solo il link di SBTpedigree. Tolti la
  scala COI, "Calcolo del gestionale (Wright)" e "Su chi cade la consanguineità". Accoppiamenti e pagina dei proprietari invariati;
  `l.sbtA` resta salvato.
- Modello A: "✔ Consegnato" nel riquadro (`maGo` modo `done` → `l.enciA`, chiude la scadenza "ENCI Modello A"); dopo resta
  "✅ Consegnato il …". Prima mostra la scadenza (25 giorni dalla nascita).

## Pubblica sul sito (ottobre 2026)
- "🌐 Pubblica sul sito" (riquadro "Sul sito" della cucciolata `cuPub`, Esposizioni di ogni cane `shPub`): gli stessi file dello zip
  (`data/cucciolate.json` + foto dei genitori in `static/images/cucciolate/`, `data/esposizioni.json`) vanno nel repository
  `zonerosse/delpiccolodiavolo-hugo` con un commit su `main` (`POST /api/publish`, functions/api/publish.js, solo admin; percorsi
  ammessi data/ static/ content/ assets/ i18n/). Il sito si ricostruisce da solo: resta HTML statico, leggibile da Google e IA.
- Chiave: segreto Cloudflare `GITHUB_TOKEN` del progetto gestionale-allevamento (fine-grained, solo il repository del sito,
  Contents: Read and write). Messo da Paolo il 04/10/2026. Se scade o viene tolta, il bottone dice l'errore e resta
  "Scarica lo zip come prima" (`cuPrep`, `shPrep`). Ultima pubblicazione in `settings.sitePub`.
- Dopo una pubblicazione dal gestionale, prima di lavorare sul sito in locale fare **Fetch/Pull** in GitHub Desktop.

## Programma, Diario e Novità in Home dal gestionale (ottobre 2026)
- Riquadro "🌐 Sul sito" della Scheda della cucciolata (`cuBox` + `siBox`), solo per le cucciolate da ottobre 2026 in poi
  (`siOk`, `SI_FROM`; quelle di prima hanno schede e pagine scritte a mano): interruttore **Novità in Home** (una cucciolata alla
  volta, `homeSince`; spento + Pubblica → il riquadro sparisce), **A che punto è** (In programma / In arrivo / Sono nati, solo
  dopo la nascita), **Programma di allevamento**, **Diario dell'allevamento**, **Pagina Cuccioli** (`l.web`, come prima), **due
  parole** in IT/EN/DE (tutte e tre o nessuna: controllo prima di pubblicare). Dati in `l.site`.
- "🌐 Pubblica sul sito" (`cuPub` → `siBuild`): un commit con `data/cucciolate.json`, le schede `litter-card` fra i segnaposto
  `<!-- GESTIONALE:INIZIO/FINE -->` delle tre pagine del Programma (`blocks`), le pagine del Diario
  `content/<lingua>/diario-allevamento/*.md` con `gestionale: true` (file protetti: il server non scrive mai sopra una pagina
  senza quella riga; spegnendo Diario le cancella con `deletes`), `data/novita.json` per la Home e le foto (genitori in
  `static/images/cucciolate/`, "Tutta la cucciolata" in `static/images/diario/<slug>/` con l'età in giorni).
- Pagine del Diario: nel front matter anche il blocco `scheda:` (madre, padre: solo i nomi; maschi, femmine; le prime due foto
  con alt), letto dalla sezione "L'ultima cucciolata" della pagina Cuccioli del sito (scelta A di Paolo, 08/10/2026; i colori
  non sono nel gestionale). Se la stessa cucciolata ha acceso anche "Pagina Cuccioli", sul sito quella sezione si nasconde da sola
  e resta la scheda (scelta D).
- Testi come il sito (COME-SI-SCRIVE del repository del sito): niente linguaggio da vendita o lista d'attesa, tre lingue,
  paragrafo citabile 110–160 parole, description 140–165 caratteri, aria-label sui link esterni. Provato con Hugo 0.152.2 e
  `tools/controlli/verifica.py`: nessun avviso nuovo.
- Il sito ha bisogno di `layouts/partials/novita-home.html` e del segnaposto `<!--NOVITA-->` nelle tre Home (zip
  `delpiccolodiavolo-novita-home.zip`, 04/10/2026).
- Miglioramenti SEO (scelte di Paolo, 04/10/2026): le pagine del Diario del gestionale entrano da sole in llms.txt (lato sito);
  quando cambiano le schede del Programma il server mette `lastmod` di oggi nelle tre pagine (`blocks[].lastmod`); foto con nomi
  descrittivi (`siPhoto`: `<nome-cane>-staffordshire-bull-terrier.<ext>`, anche per la pagina Cuccioli; `siPicName` per il Diario).
- Frase sotto la scheda del Programma (scelta C di Paolo, 04/10/2026, dopo aver scartato l'API di Claude perché a pagamento a
  parte): `siFrase`, fissa, in tre lingue, interruttore `l.site.fr` (acceso di base). Non ripete monta, parto e cuccioli; dice cosa
  succede dopo (In programma: dipende dal calore; In arrivo: si aggiorna alla nascita; Sono nati: rimando al diario o affido dopo
  60 giorni). Niente caselle di testo, niente chiavi esterne.

## Funzioni con Claude, parte 1 (ottobre 2026)
- `POST /api/ai` (functions/api/ai.js, segreto Cloudflare `ANTHROPIC_API_KEY`, modello claude-sonnet-5-5, solo admin): compiti
  `in` (messaggio ricevuto → italiano, con la lingua), `out` (italiano di Paolo → lingua del cliente), `richiesta` (riassunto,
  bozza nella voce di Paolo, traduzione), `referto` (PDF o foto → titolo, data, laboratorio, microchip, test in it/en/de).
  Niente parte da solo: il gestionale mostra il risultato, Paolo controlla e manda o salva. Credito finito → messaggio chiaro.
- **💬 Traduci** (voce del menu, `tab="traduci"`, `trPage`): incolla il messaggio ricevuto → italiano; risposta in italiano →
  lingua scelta (en, de, fr, es, sl) → WhatsApp (al numero del proprietario, o scelta della chat), Email, Copia. Dalla pagina di
  un proprietario: "💬 Messaggio tradotto" (`trOpen`, sa numero, email e lingua). Comando rapido dell'iPhone:
  `https://gestionale.delpiccolodiavolo.it/#traduci=<testo>` (`trFromHash`) apre Traduci con il testo già tradotto.
  Paolo non conosce inglese e tedesco: l'inglese e il tedesco li scrive sempre Claude.
- **Richieste** (Attesa → scheda della richiesta): "✨ Riassunto e bozza di risposta" (`wlAi`), bozza modificabile in italiano,
  "Ritraduci", poi Email / WhatsApp / Copia.
- **Referti** (Referti e documenti → Aggiungi): "✨ Leggi con Claude" (`docAi`) compila titolo, titolo inglese e data se vuoti,
  controlla il microchip con quello della scheda, propone i test genetici da aggiungere (`docAiApply` al Salva: tests,
  tests_en, tests_de, senza doppioni).
- Traduci → "✨ Proponi risposte" (scelta di Paolo, 04/10/2026): compito `risposte` di /api/ai, 3 risposte diverse
  nell'approccio, con etichetta, in italiano e già tradotte nella lingua scelta; per ognuna WhatsApp, Copia, ✏️ Modifica (la mette
  in "Rispondi in italiano"). Il comando rapido dell'iPhone "Traduci con gestionale" (Ricevi da Condivisione → Codifica URL →
  Testo `https://gestionale.delpiccolodiavolo.it/#traduci=` + testo codificato → Apri URL) è fatto e funziona.
- Traduci: casella "Numero WhatsApp (facoltativo)" (`TR.num`): se c'è, i bottoni WhatsApp aprono la chat con quel numero
  (anche se non è in rubrica: wa.me/<numero>); numeri italiani anche senza +39, stranieri con il prefisso. Altrimenti numero del
  proprietario, o scelta della chat.

## Ritocchi del 04/10/2026
- Regola del 2° calore (Accoppiamenti/ENCI): vale solo per la prima cucciolata di una femmina sotto i 2 anni alla monta; se ha
  già figliato o ha almeno 2 anni è "2° calore superato".
- "Prossimo calore previsto" senza calori: "segna l'ultimo calore, anche passato, per calcolarlo" (1 calore → +180 giorni;
  2 o più → media degli intervalli).
- ✕ tonda in alto a destra in ogni finestra (`sheet()`, classe `.sh-x`, ferma in alto anche scorrendo).

## Messaggi dalla Lista d'attesa (04/10/2026)
- 💬 su ogni riga (`wlMsg`): apre Traduci con la persona della lista (`TR.wl`, `trContact`): numero, email e lingua della
  richiesta. In Traduci c'è anche "🇮🇹 Italiano (non tradurre)": il testo va com'è ("✔ Pronto da mandare").
- 📣 Messaggio a tutti (`wlAll`, in alto per tutta la lista, accanto a ogni cucciolata per chi aspetta quella; mai chi ha
  rinunciato): italiano una volta, "✨ Traduci per chi è straniero" (una traduzione per lingua, `wbTr`), poi WhatsApp/Email a
  ciascuno nella sua lingua (si segna ✔ nella finestra) e un'email unica in copia nascosta per lingua.
- "COI SBT del test mating: [ ]%" in Accoppiamenti è una casella da riempire, non un errore.
- Accoppiamenti → "📷 Leggi il test mating" (`tmPick`/`tmRead`, compito `testmating` di /api/ai): screenshot o PDF della pagina
  Testmating COI di SBTpedigree (i numeri SBT li vede solo Paolo con il Level 2: il link da fuori non funziona). Claude legge COI
  8/3/5 generazioni, antenati, ancestor loss, più ripetuti; avvisa se è l'analisi di un cane solo o se i nomi non sono quelli
  della coppia. "💾 Salva" → `setMateSbt` + `D.matings[k].sbtRead`. Le immagini lunghe vengono tagliate in alto (lì ci sono i numeri).
- Test mating: Claude legge anche la tabella "Ancestor list" (Blood %): i 6 antenati con più sangue senza padre e madre, con
  comparse e generazioni (`blood`), mostrati prima dei "più ripetuti" (per Paolo contano le percentuali). Screenshot lunghi
  mandati a pezzi (`aiImgParts`, fino a 4). Traduci dalla Lista d'attesa e dal proprietario: numero già nella casella Numero.
- 💬 dalla Lista d'attesa: il messaggio della richiesta (note, esperienza, preferenza) è già in "Ti hanno scritto"; in italiano
  si legge com'è ("Il suo messaggio"), in altra lingua Claude lo traduce da solo. Sotto: Proponi risposte, WhatsApp, Rispondi.
  Nella parte "Rispondi" c'è sempre anche "Apri WhatsApp" (chat della persona).
- Lista d'attesa, su ogni persona: 🔗 Collega (`wlLink`: cucciolate di `wlLitters`, o nessuna → `x.litter`), 📎 Manda il link
  (`wlSend`, solo se collegata: messaggio breve fisso it/en/de + `litUrl` nella sua lingua: Diario del gestionale se nata, scheda
  nel Programma se c'è, altrimenti pagina Cuccioli; WhatsApp, Email, ✏️ Cambia in Traduci). Accanto a ogni cucciolata
  "📎 link a tutti" (`wlSendAll`: 📣 Messaggio a tutti con testo e traduzioni già pronti).

## Interessati (04/10/2026)
- Chi scrive su WhatsApp senza compilare il modulo. `D.interested` (vedi commento in index.html). Traduci → "➕ Metti negli
  interessati" (solo se Traduci non è già legato a qualcuno; compito `interessato` di /api/ai, senza numero). Pagina Attesa →
  sezione "👀 Interessati" in cima (solo `status:"open"`): 💬 (`intMsg`, Traduci con `TR.int`), ⬆ (`intToWl`: entra nella
  Lista d'attesa come "Contattato", source WhatsApp, messaggio nelle note), scheda (`intForm`) con "Non più interessato".
- Numero senza scriverlo: secondo comando rapido dell'iPhone "Salva negli interessati" (WhatsApp → nome della persona →
  Condividi contatto) → `#interessato=<nome>|<numero>` (`intFromHash`): completa l'interessato aperto senza numero con lo
  stesso primo nome, se no ne crea uno nuovo; poi apre la sua scheda.
- Accoppiamenti, "Su chi cade la consanguineità": se la coppia ha il test mating letto (`sbtRead.blood`) usa quello (`sbtWeight`:
  % di sangue, comparse, generazioni, barra con tacca della quota normale 100/2^gen della prima comparsa); nomi con link alla
  scheda del cane se è nel gestionale, altrimenti ricerca della pagina su SBTpedigree. Senza test mating: `ancWeight` come prima.
- Accoppiamenti: Femmina e Maschio sono caselle in cui scrivere (`combo` con `data-only` = candidati di `mateFemales`/
  `mateMales`, senza i vietati ENCI salvo "mostrali"; accanto ai maschi l'etichetta COI `mateLab`). "✨ Suggerisci i maschi"
  (`mateSug`): ordine per COI nella fascia 6–9% (pairCoi), test L2HGA e HC, età; albero incompleto → "fai il test mating";
  sopra la fascia in fondo, grigi, "non suggeriti".
- "Su chi cade" con COI SBT scritto a mano (senza tabella del sangue letta): `ancWeight(s,d,sbt)` riporta le quote del
  gestionale sul valore SBT ("≈", con la percentuale di albero conosciuta) e invita a leggere il test mating per il dato esatto.
- Accoppiamenti, "📊 Calcola e mostra il grafico" (`MATE_GRAPH`, `mateGraph`): la scala di `coiScale` (fascia 6–9%, 3/5/8 gen.,
  chi pesa di più) con i dati migliori disponibili: test mating letto > COI SBT scritto > calcolo del gestionale (con % di albero).
- "Importa modifiche" con `analisiSbt`: ora salva sempre anche nella coppia (`D.matings["sire|dam"]`: coiSbt + sbtRead con `blood`),
  e se la cucciolata non esiste ancora salva solo nella coppia. `a.blood` = [{name,pct,n,gens}] dalla tabella "Ancestor list".

## Link da condividere della coppia (04/10/2026)
- Accoppiamenti → "🔗 Link da condividere" (`mateShare`): token in `D.matings[k].share`, link `/p/coppia/<token>`
  (functions/p/coppia/[token].js serve public/coppia.html; dati da `GET /api/public/coppia/<token>`: nomi, genitori, test, titoli,
  ID SBT, COI SBT, test mating letto; mai note, proprietari, prezzi). Pagina in italiano o inglese (`?l=en`), noindex.
  WhatsApp 🇮🇹/🇬🇧 (scelta della chat), Copia, Apri; "Link del test mating su SBT" facoltativo (`tmUrl`, solo sbtpedigree.com;
  se vuoto: pedigree?SIRE=&DAM=&generation=8 dagli ID SBT). "Disattiva il link" toglie il token.
- Accoppiamenti: "🔍 Vedi il test mating su SBT" (`tmOpen`: `tmUrl` o pedigree?SIRE&DAM dagli ID SBT, se no chiede il link e lo
  salva) e "📷 Carica screenshot o PDF" (il vecchio "Leggi il test mating", che apriva la scelta dei file).
- Traduci: dopo "Traduci in italiano" le 3 proposte di risposta partono da sole. Riquadro "Dimmi cosa vuoi rispondere" (`TR.idea`,
  "✨ Scrivi la risposta"): compito `risposte` con `idea` → 2 versioni che dicono esattamente quello, in italiano e tradotte.
- Proposte di risposta come in chat con Claude (scelta di Paolo): etichetta, sopra il testo da mandare nella lingua del cliente,
  sotto in piccolo l'italiano; per ognuna WhatsApp, Copia, ✏️ Modifica.
- Traduci, bottone WhatsApp nella parte "Rispondi" (`trWa`): mette sempre il testo nel messaggio (traduzione se c'è; in italiano la
  casella; altrimenti traduce e poi apre WhatsApp). Prima apriva solo la chat e Paolo doveva incollare.
- Accoppiamenti, storico: ogni coppia guardata si segna in `D.matings[k].seen` (`mateSeen` in `calcMate`; salva al più una volta
  all'ora per coppia). Menu "🕘 Coppie già guardate" in cima (`mateHist`): coppie con seen, COI SBT o test mating letto, le più
  recenti prima, con COI e data; sceglierne una la apre.
- Accoppiamenti, disposizione dal disegno di Paolo (04/10/2026): 🕘 Coppie già guardate · Maschio a sinistra, Femmina a destra ·
  fila fissa `.mate-bar` (📊 Calcola = apre/chiude il grafico, ✨ Suggerisci, 🔍 Test mating SBT, 📷 Carica PDF COI) · avviso maschi
  non permessi · ➕ Aggiungi maschio da SBT · la coppia (senza più i bottoni doppi; resta 🔗 Link da condividere). Il COI si
  ricalcola da solo a ogni cambio. Attenzione: `.bar` è già usata (barrette alte 6px), non riusarla.
- Fila dei 6 bottoni su due righe (`.mate-bar`, griglia 3×2): 📊 Calcola · ✨ Suggerisci · 🔗 Carica link SBT (`tmLink` → `tmUrl`) /
  🔍 Vedi test SBT (`tmOpen`) · 📷 Carica PDF COI (`tmPick`; con 💾 Salva il file resta nella coppia: `tmFile`, `tmFname`) ·
  📄 Vedi PDF COI (`tmView`).
- "📄 Vedi analisi COI" (`mateAnalysis`, al posto di "Vedi PDF COI"): finestra con COI 8/5/3, ancestor loss, scala, lettura in
  chiaro scritta dal gestionale (niente Claude), tabella dei richiami (sangue, normale, eccesso, volte, generazioni, lato padre/madre
  per i cani nel gestionale), genitori. Dati da `pairData`: test mating letto nella coppia, se no analisi SBT della cucciolata
  (`sbtA`, anche pianificata). La pagina condivisa (/api/public/coppia) usa la stessa regola: prima risultava "—%" per Queen ×
  Forever, che aveva i dati solo nella cucciolata pianificata.
- Analisi COI: niente più "più ripetuti" (Paolo li considera fuorvianti); sempre la tabella "I più influenti dopo i genitori" con il
  sangue %: dalla tabella SBT se letta, altrimenti calcolata dal pedigree del gestionale (`bloodTree`: nonni 25%, bisnonni 12,5%…,
  somma delle comparse, padre e madre esclusi), con quota normale, eccesso, generazioni e lato.
- Ricaricando la pagina si resta dove si era: `render()` salva tab, scheda aperta e coppia in sessionStorage `gx_nav`; all'avvio
  (dopo il caricamento dei dati, non per Daniela né per chi consulta) si ripristinano se esistono ancora.
- Analisi COI senza test mating SBT: COI 8/5/3 e ancestor loss del gestionale (`coiAt`, `lossTree` sugli antenati noti), con la
  scritta "numeri del gestionale, albero al X%" (poco affidabili sotto il 70%). Prima mostrava "—%".
- "📷 Carica PDF COI" ora carica e salva in un colpo: se i nomi sono quelli della coppia salva da solo (`tmSave`) e apre l'analisi;
  chiede conferma solo se è l'analisi di un cane solo o se i nomi non tornano.
- Scheda del cane → Test genetici → "🧬 Carica test genetici (screenshot o PDF)" (`gtPick`/`gtRead`/`gtSave`, compito `referto`):
  conferma con spunte e controllo microchip; salva i test in tests/tests_en/tests_de (senza doppioni) e il file in Referti e
  documenti. Da lì li usano analisi COI, pagina condivisa, sito, Suggerisci.
- Accoppiamenti: anche "🧬 Test genetici maschio" e "🧬 Test genetici femmina" nella fila (ora 4×2, 2 colonne sul telefono):
  stesso flusso di `gtPick` sul cane scelto.
- Spunte verdi ✓ (`.ok-v`, Paolo 05/10/2026: "se un dato è già inserito o allegato devo VEDERLO"): nella fila di Accoppiamenti
  su link SBT, test genetici di maschio e femmina, PDF del test mating, analisi COI disponibile; nella scheda del cane accanto a
  "Test sanitari". Bordo verde sul bottone (`.has`).
- "Cosa c'è" su tutte le schede (`ckItems` cane/cucciolo/proprietario, `ckLit` cucciolata, `ckDecorate` dopo il disegno):
  voci verdi ✓ / bianche ○, tocco = vai alla sezione (`ckGo`); ✓ verde sui titoli delle sezioni con dati. Cucciolo = nato in
  una nostra cucciolata con proprietario o prenotato/ceduto.
- 🧬 Test genetici maschio/femmina in Accoppiamenti: se il cane ha già i test apre `gtShow` (testo nella scheda, en, referti
  allegati con Visualizza/Scarica, "📷 Carica altri test", "Apri la scheda del cane"); solo senza test apre la scelta del file.
- REGOLA di Paolo: ogni bottone di caricamento, se il dato c'è già, prima lo mostra (con ✓) e da lì si cambia o si ricarica.
  Fatto per: link SBT (`tmLinkShow`), PDF test mating (`tmPdfShow`), test genetici (`gtShow`; nella scheda del cane i test sono
  già visibili sopra e il bottone diventa "Carica altri test"). Da applicare a ogni bottone nuovo.
- Correzione 05/10/2026: dopo il salvataggio del test mating (tmSave) e del link (tmLink) si ridisegna tutta la pagina
  (render), non solo la coppia (calcMate): la fila dei bottoni con le ✓ sta in mating() e prima restava vecchia fino al ricarico.
- Test e salute (`gtSheet`): Claude legge TUTTI i valori (test genetici, anche HD, gomiti ED, dentatura, occhi, cuore, rotula…) con il
  valore com'è scritto e chi l'ha valutato; elenco a sinistra con spunte; se nella scheda c'è già un valore diverso per la stessa
  voce lo segnala ("⚠️ nella scheda c'è: …") senza cambiarlo da solo.
- REGOLA di Paolo: "leggi sempre TUTTO e cataloga". Compito `referto`: `items` con tutto quello che c'è scritto, per categoria
  (genetico, anche, gomiti, dentatura, occhi, cuore, rotula, udito, altra salute, vaccino, titolo, identificazione, pedigree,
  altro). `gtSheet` le mostra raggruppate; al Salva: salute/genetica → tests*, titoli → titles*, vaccini → health.vacc,
  microchip/LOI solo se vuoti; pedigree e altro solo da leggere.
- ✓ di "📷 Carica PDF COI" e finestra `tmPdfShow`: guardano anche il test mating salvato nella cucciolata (`sbtA`, con `sbtA.pdf`),
  non solo quello della coppia (`pairData.file/read`). Caso Desy × Forever: dati nella cucciolata pianificata.
- Consegna (`KIT`): aggiunti Passaporto, Avvio pratica export pedigree, Vaccino antirabbica (in fondo, d.kit è per posizione);
  Paolo li spunta a mano. Anche fra le voci "Cosa c'è" del cucciolo.
- Consegna con allegati: 📎 Allega su ogni voce (`kitAtt`): documento in Referti e documenti con titolo della voce e `kit:i`,
  voce spuntata da sola; se c'è già (`kitDoc`: kit:i o titolo/nome file riconosciuto, libretto anche dai vaccini) ✓ con
  Visualizza/Scarica. Spunta a mano sempre possibile.
- Pagina del proprietario, "Cosa ricevi con…" (`kitOwner`): solo le voci che Paolo ha spuntato nella Consegna; nessuna voce →
  la sezione non compare.
- Test genetici "presenti" (`gtHas`): testo nei test O referto allegato (`gtDocs`: flag `gt` dei file caricati con 🧬, o titolo/nome
  riconosciuto). ✓ in Accoppiamenti, nella scheda e in "Cosa c'è"; 🧬 mostra prima i file anche se dal file non è uscito testo.

## Google: recensioni e post (ottobre 2026)
- Voce di menu **Google** (chiave `recensioni`) con due sezioni: **⭐ Recensioni** e **📣 Post** (`RV.sub`, scelta di Paolo:
  una sola voce). Numero sul menu = recensioni da rispondere + post da proporre (`rvBadge`).
- Sezione **Recensioni** (solo Paolo; tolta a chi consulta e a "conti"): legge le recensioni del profilo Google, per ogni
  recensione senza risposta Claude propone **due ringraziamenti brevi** (`/api/ai`, task `recensione`) oppure scrive la
  risposta dallo **spunto** di Paolo; la risposta resta modificabile e parte solo con **"Pubblica su Google"**.
  Le risposte già date si cambiano con "Modifica" → "Salva su Google" / "Annulla modifiche". Numero da rispondere sul menu.
- In alto "Su Google" (voto e numero) e "Sul sito" (letto da `hugo.toml` del sito). Il sito si aggiorna **solo con il tasto
  "Aggiorna il sito a N"** (scelta di Paolo, mai da solo): `POST /api/reviews {task:"site"}` cambia solo
  `recensioniTotale` e `recensioniVoto` in `hugo.toml` di `zonerosse/delpiccolodiavolo-hugo` con un commit (`GITHUB_TOKEN`).
- Server: `functions/api/reviews.js` (GET elenco, POST `reply` / `site`), `functions/api/google.js` (collegamento OAuth una
  volta sola, trova da sé la scheda "…Piccolo Diavolo…"), `functions/_gbp.js` (token e tabella D1 `gbp` con refresh token e
  scheda: **mai nel repository**). Segreti Cloudflare: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  URI di reindirizzamento da registrare in Google Cloud: `https://gestionale.delpiccolodiavolo.it/api/google`.
- Google dà l'accesso alle API del profilo solo dopo la richiesta "Application for Basic API Access" (numero del progetto):
  finché non approva le chiamate danno 403/429 e la scheda lo dice in italiano.
- Codice client: blocco "Recensioni Google" (`RV`, `rvPage`, `rvAct`, `rvSite`, `rvFromHash`) nel blocco comune, uguale nei due file.
- Sezione **Post** (`gpPage`, `GP`): propone un post per gli "Aggiornamenti" del profilo Google quando c'è una novità
  (`gpEvents`): cucciolata nata con la pagina del Diario sul sito e foto più nuove dell'ultimo post (`l.gpost={date,at}`),
  oppure risultato d'esposizione sul sito (`s.web`) degli ultimi 60 giorni non ancora raccontato (`s.gpost`).
  Claude scrive il testo (`/api/ai`, task `post`: notizia, mai vendita, niente telefono, non dice quanti cuccioli),
  Paolo sceglie la foto e pubblica con il tasto (`POST /api/posts`); "Non serve" segna la novità senza pubblicare.
  La foto Google la scarica da `/api/public/gpost/<chiave>`: aperto solo 2 giorni e solo per le chiavi registrate
  (tabella `gbp`, `media:<chiave>`). Controlli anche sul server: niente numeri di telefono, max 1.500 caratteri.
- **"✍️ Scrivi un post"** (`gpFreeHtml`, `gpFreeAct`, `GP.free`): post libero di Paolo. Due righe sue → testo di Claude
  (task `post` con `idea`); foto fra le ultime 16 caricate (`gpRecent`: foto settimanali, di cucciolata, dei cani) o senza
  foto; tasto "Scopri di più" verso Home, Cuccioli, Diario di una cucciolata, Palmarès o nessuno (`gpLinks`).

## Google → 🌐 Pagine del sito (08/10/2026, scelte di Paolo: A dentro Google, B traduzioni automatiche, C2 tutto insieme)
- Terza sezione della voce Google (`RV.sub="pag"`, `pgSite`, `PG`, `pgAct`; blocco "Google → Pagine del sito" uguale nei due file,
  CSS `.pg-*`). Per ogni pagina del sito: titolo per Google (30-60), descrizione (140-165), titolo grande (h1), frase di
  apertura, blocchi accesi/spenti, link "Leggi anche" (max 6). Paolo scrive SOLO in italiano: quando esce da un campo parte
  `pgTranslate` → `/api/ai` compito `sito` (traduce in inglese e tedesco con la parola chiave della lingua e le misure giuste);
  inglese e tedesco nel gestionale si leggono soltanto.
- Testo di oggi e blocchi: `https://delpiccolodiavolo.it/pagine-indice.json` (lo genera il sito, CORS per il gestionale;
  blocchi = commenti `<!--BLOCCO:n-->` nelle pagine, vedi CLAUDE.md del sito). Dati: `D.sitePages[translationKey] =
  {it:{title,desc,h1,ap}, en, de, spente:[n], link:[{key,it,en,de}], mod, dirty, pub}`; campo vuoto = testo di oggi.
- Controlli prima di pubblicare (`pgChecks`): misure, parola chiave della lingua nei campi cambiati, niente "!", traduzioni fatte,
  link completi. Avvisi (`pgWarn`) quando si spegne un blocco con FAQ, parola chiave o link verso altre pagine.
- "🌐 Pubblica tutte le modifiche" (`pgPublish`): un commit con `data/pagine.json` (tutte le pagine con modifiche), `mod` = oggi
  per quelle cambiate (sitemap/IndexNow le vedono aggiornate). Pagine da pubblicare segnate ✏️ (anche sul tasto della sezione);
  "Annulla modifiche di questa pagina" torna a `pub` (l'ultima pubblicazione).

## App sul telefono (ottobre 2026)
- Il gestionale si installa come app web: `public/manifest.webmanifest` (nome "Gestionale", schermo intero), icone dal logo
  dell'allevamento (scelta A di Paolo: `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `favicon-32.png`, fondo bianco), meta tag in `index.html`. Il manifest ha `crossorigin="use-credentials"` per Cloudflare Access.
- iPhone: Safari → Condividi → "Aggiungi alla schermata Home". La prima apertura dall'icona chiede il codice di Access
  (l'app sulla Home non condivide i cookie con Safari). Durata della sessione di Access: 1 mese (impostata da Paolo in Zero Trust).

## Eliminare un cane (ottobre 2026)
- In Modifica del cane, in fondo e separato: "🗑 Elimina questo cane" (`dogDelAsk`, `dogDel`, `dogLinks`). Si elimina solo un
  cane senza legami: niente figli in archivio, nessuna cucciolata come padre/madre, nessun proprietario, nessun contratto;
  altrimenti il riquadro spiega cosa lo blocca. Si tolgono anche le voci di `D.matings` con quel cane. I file in R2 restano;
  per recuperare c'è la copia di sicurezza della notte. Per un dato sbagliato (es. il sesso) si usa Modifica.

## Ricerca con suggerimenti (ottobre 2026)
- In Cani il campo "Cerca in tutti i cani" (`#srch`) cerca sempre in tutto l'archivio (nome, soprannome, LOI, microchip),
  qualunque filtro sia scelto, e mostra fino a 8 suggerimenti (`sxShow`, `sxGo`, `#sxsug`): ♂ azzurro/♀ rosa, lettere
  evidenziate, gruppo (Mio/Esterno/Ceduto/Prenotato/Sterilizzata…). Tocco, o frecce e Invio, aprono la scheda.
  Il campo non filtra più l'elenco sotto (`q` resta vuoto): l'elenco segue solo i bottoni (scelta di Paolo).

## Schede che non si aprono (ottobre 2026)
- `dogDetail` è chiamata tramite `dogDetailSafe`: se la scheda va in errore, al posto del nulla compare un riquadro con il
  messaggio d'errore da mandare a Claude. Ogni sezione della scheda passa da `safe(()=>…,"nome")`: una sezione rotta
  mostra "⚠️ La parte «nome» non si è caricata" e il resto della scheda si apre lo stesso.
- Foto in cima alla scheda (`.hero-photo`, ottobre 2026, scelta di Paolo): intera (`object-fit:contain`), mai ingrandita oltre
  la misura vera (`width:auto`), al massimo 320×320 px. Così le foto piccole non si sgranano e nessuna viene tagliata.
  Stessa regola per le foto dei genitori nel riquadro Pedigree (`.phi img`): intere, mai ingrandite, al massimo 260 px di altezza.

## Foto più piccole e visore (ottobre 2026, scelta di Paolo)
- Nelle schede le foto sono piccole e sempre intere: in cima `.hero-photo` max 200 px, genitori nel Pedigree `.phi img`
  max 150 px di altezza, foto settimanali `.gal` a riquadri da ~105 px con `.wpi` in `contain` (niente tagli).
- Toccando una foto si apre il visore `lbShow(src)` (anche per tutti i link a immagini, come prima): adattata allo
  schermo ma mai più grande dell'originale; tocco sulla foto o "Dimensioni originali" → grandezza piena da scorrere;
  in basso le dimensioni originali. Le foto settimanali nel gestionale di Paolo aprono ancora la loro scheda di modifica.
- Nei post (proposte e "Scrivi un post") il primo riquadro delle foto è **"➕ Aggiungi foto"** (`gpUpload`, `GP.up`):
  foto dal telefono o dal computer, ridotte con `shrink` e salvate su R2 con `uploadData`. Scelta di Paolo: nei post si
  vedono SOLO le foto aggiunte così (niente foto già presenti nel gestionale); senza foto aggiunte il post esce senza foto.

## Statistiche del sito (ottobre 2026, scelta di Paolo: solo delpiccolodiavolo.it)
- In Statistiche due sezioni: "🐾 Allevamento" (`stAllevPage`, quella di prima) e "🌐 Sito web" (`wsPage`, `WS`).
- `functions/api/sitestats.js` (GET `?days=7|28|90`): Google Search Console (totali e confronto col periodo prima, clic
  per giorno, 250 parole chiave con variazione di posizione, 10 pagine) e Cloudflare Web Analytics via GraphQL (visite
  ultima ora/oggi/periodo, provenienza, paesi, dispositivi, pagine). Nessuno script sul sito.
- Google: stesso collegamento del profilo, ora con permesso `webmasters.readonly` (`/api/google?ret=sito`, ritorno
  `#sitostat=`). Proprietà Search Console trovata da sola e salvata in `gbp` ("gsc"). Serve la "Google Search Console API"
  attiva nel progetto Google Cloud; nessuna approvazione di Google.
- Cloudflare: segreti `CF_API_TOKEN` (permesso Account Analytics: Read) e `CF_ACCOUNT_ID`; `CF_SITE_TAG` facoltativo
  (senza, filtra per host delpiccolodiavolo.it).
- Periodi: 24 ore (dati "freschi" di Search Console, provvisori, grafico ora per ora con `hourly_all`), 7, 28, 90 giorni.
  Filtro **🇮🇹 Solo Italia** (predefinito) / 🌍 Tutto il mondo: `it=1|0`, filtro paese "ita" su tutte le richieste.
- **📍 Posizioni su Google Maps** (`functions/api/maps.js`, `wsMapsHtml`): DataForSEO Maps live, coordinate di ogni città
  (zoom 13), posizione della scheda "…Piccolo Diavolo…" nei primi 20 ("oltre 20" se manca), ▲▼ rispetto al controllo prima.
  Segreti `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`. Parole e città modificabili (max 10+10; città nuove da OpenStreetMap),
  salvate in `gbp` "maps:cfg"; ultimi 12 controlli in "maps:runs". Controllo da solo se l'ultimo ha più di 7 giorni, o col tasto.
- **🔎 Ricerche che mostrano il profilo** (`gbpKeywords` in sitestats, `wsGbpkHtml`): Business Profile Performance API,
  ultimi 3 mesi mese per mese; finché Google non approva le API del profilo mostra l'attesa.
- **💬 Contatti WhatsApp dal sito** (`wsWaHtml`, `waStats` in sitestats): i tasti WhatsApp del sito passano da `/wa/` (funzione
  del sito) che chiama `POST /api/public/walog` con la chiave `WA_KEY` (stessa nei due progetti Cloudflare). Tabella D1 `wa`
  (ts, day ora di Roma, path, lang): niente IP né dati personali. Totale, oggi, media, grafico per giorno, pagine, lingue.
- "Da dove arrivano" (Cloudflare) unisce le voci (`wsRefs`: Google, Facebook, Bing…), scrive "circa" (stime campionate),
  accanto a Google i "clic veri" di Search Console, e la nota che le stime comprendono robot e audit SEO.
- Tetto di spesa per Maps (scelta di Paolo): massimo `MAPS_CAP` ricerche al mese (predefinito 100 ≈ 0,20 $), contatore in
  `gbp` "maps:used:AAAA-MM". Oltre il tetto il controllo non parte; quello automatico non apre finestre, scrive l'avviso.
- **Tetto per Sottosopra** (`functions/api/public/budget.js`): la funzione `/api/posizioni` di puntowebferrara.com chiede
  il permesso prima di ogni analisi (chiave `WA_KEY` qui = `GESTIONALE_KEY` là). Massimo `SOTTOSOPRA_CAP` analisi al mese
  (predefinito 30). Se il gestionale non risponde, Sottosopra non spende.
- **Visite di Cloudflare tolte** (scelta di Paolo, ottobre 2026): la sezione "Visite sul sito" non c'è più e `cloudflare()`
  in sitestats non viene chiamata; `CF_API_TOKEN`/`CF_ACCOUNT_ID` non servono. Resta il contatore WhatsApp (tabella D1 `wa`).
- Luoghi di Maps (scelta di Paolo, ottobre 2026): Italia e regione con `location_name` del fornitore (come in Sottosopra:
  "Italy", "Emilia-Romagna,Italy"), i capoluoghi con le coordinate (zoom 12): tutti quelli dell'Emilia-Romagna più Padova
  e Rovigo. Massimo 15 luoghi e 10 parole. Controllo automatico ogni due settimane (tetto 100 ricerche al mese invariato).
- Correzione (ottobre 2026): il contatore di Maps conta solo le ricerche riuscite (chiave `maps:used2:AAAA-MM`; il primo
  contava anche i tentativi falliti per credito esaurito). Senza credito la pagina dice "DataForSEO è senza credito".
  Niente bandierine emoji (su Windows non si vedono): "Solo Italia", "Italiano/Inglese/Tedesco" in testo.
- Ordine della pagina Sito web (scelta di Paolo): prima 💬 Contatti WhatsApp, poi "Ricerche su Google" (con Solo Italia /
  Tutto il mondo), poi Maps e profilo. Parole chiave: prime 10, il resto con "▾ Mostra le altre N" (`WS.allq`); scrivendo
  nel campo di ricerca compaiono tutte quelle che corrispondono. "Payment Required" di DataForSEO = senza credito.

## Email dei Modelli A e B ENCI dal computer (ottobre 2026)
- "✉️ Email alla delegazione" da computer (`encDesktop`, `encGmail`): scarica il PDF e apre Gmail di zonerosse@gmail.com
  (`authuser`) con destinatario, oggetto e testo già scritti (`maText`/`mbText`); il PDF si trascina nell'email (Gmail non
  allega da un link). Sul telefono resta il pannello Condividi, che allega il file da solo.

## Agenda: ritiri dei cuccioli e visite in allevamento (ottobre 2026, scelte di Paolo)
- Voce di menu **📅 Agenda** (`agPage`, `AG`, dati in `D.agenda`): ritiri (k "r", legati al cucciolo `dog`) e visite (k "v").
  Stati: d da confermare, c confermato, r ritirato, f visita fatta. Filtri Tutto / Ritiri / Visite, "➕ Nuova visita".
- I cuccioli "prenotati" con proprietario e nati da meno di 6 mesi senza ritiro fissato compaiono da soli in "Da fissare".
- Avvisi: oggi/domani (anche in cima alla pagina Cani, `agBanner`, e numero sul menu `agCount`), appuntamenti a meno di
  un'ora, ritiro prima dei 60 giorni di vita.
- Messaggio WhatsApp: comando rapido dell'iPhone "Agenda allevamento" → `#agenda=<testo>` (`agFromHash`), oppure incollato;
  lo legge Claude (task `agenda`: tipo, data, ora, chi, città, cucciolo, cosa cerca). Paolo controlla e salva.
- Tasti: ✅ Conferma su WhatsApp (messaggio con indirizzo e link Maps), 🔔 Promemoria del giorno prima, 💬 Chiedi quando
  viene / Proponi un giorno, 📅 Al calendario (.ics con avviso 2 ore prima), 🐾 Ritirato, 👍 Visita fatta,
  ➕ Aggiungi all'Attesa (crea la richiesta in `D.waitlist`, source "visita"), ✏️ Modifica con Salva/Annulla, 🗑 Elimina.
- Il tasto fluttuante 💉 (vaccino · sverminazione · esame, `.hfab`) compare solo in Cani, Cucciolate e Scadenze (`body[data-tab]`).
- Sulla scheda di ogni appuntamento restano solo 📅 Al calendario, 🐾 Ritirato / 👍 Visita fatta, ✏️ Modifica (scelta di Paolo: tolti Conferma e Promemoria WhatsApp). Claude scrive "chi viene" e le note in modo corto.
- Aggiornamenti sul telefono: `_headers` mette `Cache-Control: no-cache` alle pagine; l'app riaperta dopo più di 20 minuti
  si ricarica da sola (`visibilitychange`), mai durante una modifica (EDIT/EDIRTY) o con un riquadro aperto.
- "Chi ti ha scritto?" (scelta di Paolo): WhatsApp non passa il numero, quindi sotto il messaggio c'è un campo facoltativo
  con suggerimenti (famiglie dei cuccioli prenotati: nome, cucciolo, telefono, città). La famiglia scelta (`AG.hint`) va a
  Claude come indizio e decide il cucciolo se il messaggio non lo dice. Dal comando rapido il gestionale NON legge da solo:
  mette il cursore su "Chi ti ha scritto?", poi Paolo preme "✨ Leggi il messaggio".

## Visore dei documenti nell'app installata (ottobre 2026)
- Solo con l'app a schermo intero (`STANDALONE`): i link "Visualizza" (target _blank) e "Scarica" (download) verso file del
  gestionale, blob o data non escono più in Safari (che non ha l'accesso Cloudflare): i PDF si aprono in `docView` (pagine
  disegnate con pdf.js 3.11 da cdnjs, caricato solo quando serve), le foto in `lbShow`, "Scarica" apre il pannello
  Condividi (`dvShare`). `window.open` è intercettato per gli stessi indirizzi (anche lo schema "finestra vuota poi
  location.href"). Link esterni (WhatsApp, SBT, Gmail) come prima. Nel browser normale non cambia niente.

## Istruzioni dell'allevatore nella pagina del proprietario (ottobre 2026)
- `ovInstr(id)`, subito sotto nome e contratto nella pagina del proprietario (cani nati da meno di 18 mesi, non esterni):
  le "istruzioni scritte del cedente" del punto 3.1 del contratto, in italiano o inglese. Riquadro rosso con la regola
  dei primi 8-9 mesi (scale in braccio: deciso da Paolo, il sito è stato allineato), poi movimento, alimentazione, pasti,
  cibi vietati, vaccini (testo di Paolo: a tre mesi, poi dopo un anno, salvo parere del veterinario), masticativi morbidi fino al cambio dei denti e niente tira e molla, niente lanci di bastoni o palline, rispetto, contatto; link alle guide del sito. Gli altri numeri sono quelli delle guide del
  sito: se cambiano lì, vanno cambiati anche qui.
- Consegna (06/10/2026): aggiunta in fondo a KIT la voce "Istruzioni dell'allevatore" (posizione 6, d.kit resta per
  posizione). In più Paolo può aggiungere voci sue dal riquadro ("➕ Aggiungi voce", nome e inglese facoltativo): stanno in
  `D.settings.kitExtra` [{id,it,en,off}], valgono per tutti i cani, spunte in `d.kitx`; "✕" le nasconde (off) senza perdere
  le spunte. Compaiono anche in "Cosa c'è" e, se spuntate, in "Cosa ricevi" del proprietario. Le voci aggiunte non hanno 📎.
- Sulla voce "Istruzioni dell'allevatore" della Consegna, al posto di 📎 Allega: "👁 Visualizza" (`instrView`: riquadro con
  `ovInstr(id,true)`, nella lingua del proprietario) e "🖨 Stampa" (`instrPrint`: stampa solo le istruzioni, classe
  `print-instr`, con intestazione allevamento, cucciolo, data di nascita, famiglia, telefono).
- Pagina del proprietario (scelta di Paolo): avviso giallo con triangolo "IMPORTANTE: leggi le istruzioni dell'allevatore"
  (`ovImp`, subito sotto il nome) SOLO quando nella Consegna è spuntata "Istruzioni dell'allevatore" (`instrOn`), a
  qualsiasi età. Le istruzioni NON sono nella scheda (troppo pesante): si aprono in una finestra (`oiOpen`/`oiClose`) dal
  riquadro giallo, dalla riga "Istruzioni dell'allevatore ›" di "Cosa ricevi" e, nella pagina vera, dal link personale
  con `#istruzioni` in fondo (si apre già all'arrivo).
- Dopo la prima apertura delle istruzioni, nella pagina vera della famiglia il riquadro giallo diventa un'etichetta piccola ("oi-small"), ricordato sul dispositivo (localStorage "oiSeen:<cane>"); nell'anteprima di Paolo resta sempre grande.

## Novità per la famiglia e "Avvisa la famiglia" (06/10/2026, scelte di Paolo)
- Pagina della famiglia: riquadro azzurro "🆕 Novità dalla tua ultima visita" (`nvBox`, sopra l'avviso delle istruzioni):
  ciò che è comparso dall'ultima volta su quel telefono (voci della Consegna spuntate, documenti non privati, ultimo peso,
  numero di foto nuove, vaccini/sverminazioni/esami). Chiavi viste in localStorage "nv:<cane>", data in "nvAt:<cane>".
  Sparisce con "Ok, visto" (`nvSeen`) e torna solo con cose nuove. Prima visita su un telefono: contano come nuove solo le
  istruzioni e ciò che ha meno di 14 giorni. Nell'anteprima di Paolo compare con ciò che è cambiato dall'ultimo avviso (o istruzioni + ultimi 14 giorni).
- Scheda del cane: "💬 Avvisa la famiglia" (`nvSheet`/`nvSend`): cosa è cambiato dall'ultimo avviso (`d.nvSent={at,keys}`),
  spunte per cosa citare, messaggio breve che si riscrive (`nvMsg`, lingua del proprietario, link con #istruzioni se ci
  sono le istruzioni), "Apri WhatsApp" nella chat della famiglia. Lo manda sempre Paolo.
- Avvisa la famiglia senza avvisi precedenti: contano come novità solo istruzioni e ultimi 14 giorni (`nvOld`); spuntate di partenza solo le istruzioni (o i documenti se le istruzioni non ci sono). Le voci sanitarie con data futura (in programma) non sono novità; niente doppioni.
- Eliminare una richiesta arrivata dal sito (Attesa, "wlDel", id "r…"): si toglie anche dalla tabella `requests` (`DELETE /api/requests?id=`) e l'id va in `D.wlGone`, così `wlSync` non la rimette. Il foglio su Drive (Apps Script) resta a parte.
- Traduci: "➕ Metti negli interessati" è un riquadro viola in cima (`.tr-int`), visibile appena c'è un messaggio e Traduci non è legato a nessuno; tolto dalla fila di tasti in basso (scelta di Paolo).
## 🪪 Anagrafe canina (07/10/2026)
- Voce di menu "Anagrafe" (`anagPage`): cani di casa (non esterni, non ceduti, non deceduti, o con `d.anag`) con stato
  ✓ iscritto / ⏳ da iscrivere / stato non segnato. Pratica (`anagOpen`): intestatario fra `D.settings.holders` (paolo,
  daniela, con CF, nascita, residenza, contatti), dati in `d.anag`, allegati scelti fra Referti e documenti (✓ su passaporto,
  vaccini, documento d'identità), 📄 dichiarazione sostitutiva artt. 46-47 DPR 445/2000 (jsPDF, come quella di Tikus),
  📎 allegati in un solo PDF (pdf-lib, PDF e foto), ✉️ email a Piera (ppAddr) con le due righe e i due PDF, ✅ segna iscritto.
  "＋ Cane acquisito" crea un cane di casa. Tikus (Virtus et Honor Amazing Paddy the Baddy, intestato a Daniela) entrato con il
  file "Importa modifiche" del 07/10/2026, con passaporto, libretto e documento di Daniela ridotti (l'originale era 41 MB).
- Anagrafe, su ogni riga: "✓ Già iscritto" (`anag.already`, senza data) / "Non iscritto", e 🗑 (`anagDel`): cancella del tutto
  solo i cani creati vuoti da "Cane acquisito"; gli altri vengono solo tolti dall'elenco (`anag.hidden`) e restano nel gestionale.
- Anagrafe, "✉️ Email all'anagrafe canina" (non più "a Piera", saluto "Buongiorno,"): dal telefono foglio di condivisione con i 2 PDF
  (Paolo sceglie Gmail o Edison Mail; indirizzo copiato); dal computer apre la scrittura di Gmail nel browser già compilata e
  scarica i 2 PDF da allegare.
- `isPhone()`: il pannello "Condividi" con i file (navigator.share) si usa solo su telefono/tablet; su Windows apriva il pannello di
  sistema (Teams, Outlook, Condivisione in prossimità). Dal PC: Gmail nel browser (anagrafe) o mailto/scarica come prima.
- Anagrafe: "Dichiarazione firmata" (`anagSign` → `anag.signed`, nome, data; ✓ e Visualizza/Cambia). "📎 PDF unico" e l'email
  mandano un solo file: dichiarazione (firmata se caricata, se no quella da firmare, con avviso) + allegati scelti.

## ☀️ Oggi (07/10/2026, scelte di Paolo)
- Prima voce del menu e pagina d'apertura (`let tab="oggi"`; per chi consulta e per "conti" non c'è). `ogPage`, `OG`.
- In cima, largo: "🌐 Sito web · ultime 24 ore" (`/api/sitestats?days=1&it=1`: clic, impressioni con confronto, posizione,
  tocchi WhatsApp, ricerca con più clic; tasto "Apri le statistiche" = Statistiche → Sito web, 24 ore).
- Poi riquadri con il numero e il tasto per la sezione: Agenda (oggi/domani e avvisi), Scadenze (in ritardo + 7 giorni,
  da `scEvents`), Richieste e interessati nuovi, Famiglie da avvisare (`ogFamilies`: novità non ancora mandate, cuccioli
  sotto l'anno, con "💬 avvisa"), Anagrafe da iscrivere, Fattrici (parto previsto, calore nelle prossime 3 settimane),
  Google (recensioni da rispondere). Nessun dato nuovo: legge quelli che ci sono.
- "✓ Non serve avvisare" (`nvSkip`): segna la famiglia come aggiornata senza mandare niente (d.nvSent con skip). Riquadri di Oggi mai più larghi dello schermo (minmax(min(300px,100%),1fr)).
- Avvisa la famiglia: "Apri WhatsApp" NON segna più l'avviso; dopo chiede "Il messaggio è partito?" e segna solo con "✓ Sì, l'ho mandato" (`nvDone`). "↺ Annulla l'ultimo avviso" (`nvUndo`, ripristina `d.nvPrev`) per gli avvisi segnati per sbaglio.
- Una tantum (07/10/2026, `nvFixOnce`, flag `D.settings.nvFix1`): tolti gli avvisi segnati prima della conferma (senza `conf`/`skip`), così le famiglie tornano da avvisare.
- Oggi → Famiglie da avvisare: tasto "✓ Già avvisati tutti" (`nvAllDone`, con conferma): segna tutte come avvisate senza messaggi.

## Pagina pubblica della coppia, completa (07/10/2026)
- Quando Paolo apre una coppia con il link attivo, `calcMate` salva in `D.matings[k].pub` un riassunto del calcolo: COI del
  gestionale, antenati inseriti/510, monta ipotizzata e parto previsto, regole ENCI (`enciCheck`), su chi cade (`coiParts`,
  primi 8 + quanti altri). L'API pubblica lo restituisce come `pub`; `coppia.html` lo mostra. Le regole ENCI NON si mostrano (scelta di Paolo).
- `coppia.html` ha lo stile delle schede delle cucciolate del sito (Programma allevamento): due cani affiancati con foto
  (`/api/public/coppia/<token>/f/sire|dam`, solo i due cani di quel link), test e titoli, genitori, link SBT; sotto COI,
  calcolo del gestionale, spiegazione, su chi cade, parto previsto, "Test mating: vedi su SBTPedigree". Lingue ?l=en / ?l=de.
- (TOLTA il 07/10/2026 su richiesta di Paolo: nessuna spiegazione sotto il COI.) Prima: se il COI SBT era sopra il 9%, la pagina mostrava la spiegazione (proposta B): "sopra la fascia che usiamo di
  solito (6-9%). Lo mostriamo lo stesso, perché i numeri si pubblicano anche quando non sono quelli ideali" + l'antenato su
  cui cade la parte più grande della parentela.
- "📷 Aggiungi foto" (`qPh`/`qPhOpen`, 07/10/2026): riquadro tratteggiato dove manca la foto: scheda del cane (grande), Accoppiamenti sotto il titolo della coppia (medio; lì si vedono SEMPRE i due cani, con la foto che si ingrandisce al tocco o con il riquadro), miniatura nell'elenco dei Cani (piccolo). Foto ridotta a 900 px, salvata subito in d.photo (poi diventa /files/ al salvataggio). Non per chi consulta.
- Pagina della coppia: barra "Leggi in: Italiano · English · Deutsch" sotto l'intestazione (variante B scelta da Paolo), con bandiere disegnate in SVG (le emoji delle bandiere su Windows non si vedono).
- Correzione 24 ore (08/10/2026): Search Console conta i giorni nell'ora del Pacifico e i dati arrivano con ore di ritardo, quindi
  "ieri+oggi" dava 0. Ora `fresh24` somma le ULTIME 24 ORE DISPONIBILI dai dati ora per ora (`hourly_all`, ultimi 4 giorni),
  confronto con le 24 ore prima, `upto` = fino a che ora arrivano i dati (come la scheda "24 ore" di Search Console). Parole chiave
  e pagine dai giorni che coprono quelle ore. Posizione senza dati: "–", senza freccia.

## ⚙️ Account (08/10/2026)
- Ultima voce del menu (`acPage`, `AC`, `acAct`; non per chi consulta né per "conti"). Riquadri: Allevamento (modificabile, vedi sotto
  "Dati dell'allevamento"), Intestatari e firma (`settings.holders` via `anagHolders`, spunte
  C.F./nascita/documento, "Cambia firma" cancella `settings.sellerSig`), Enti e destinatari (`settings.enti` = delegazione ENCI;
  `MA_TO` ora legge da lì con `MA_DEF` di base; salva anche `settings.modB` e `settings.anagrafeEmail`), Regole di allevamento
  (`settings.rules` → `EN_AGE`/`EN_GAP`, ora `let`, applicate a ogni render da `acRules`, minimo 16 mesi e 170 giorni), Collegamenti,
  Tetti di spesa, Chi entra, Copie di sicurezza.
- `GET /api/account` (functions/api/account.js, solo admin): quali chiavi ci sono (solo sì/no, mai i valori), Google collegato,
  proprietà Search Console, profilo, contatori del mese (maps:used2, budget:sottosopra), ultimo tocco WhatsApp, credito DataForSEO
  (appendix/user_data, gratuito, 6 secondi al massimo), CONTI e VIEWERS.
- PRIVACY (08/10/2026): il repository è pubblico. Tolti dal codice codici fiscali e date di nascita di Paolo e Daniela (prima in
  `ANAG_DEF` e come valore di riserva nella ricevuta della caparra): ora stanno solo in `settings.holders`. MAI rimettere dati
  personali nel codice. (Restano nella cronologia di GitHub: Paolo può rendere privato il repository.)

## ⚙️ Account: tetti, chi entra, tasti rapidi (08/10/2026)
- Collegamenti: accanto a ogni riga un link (`acLk`) alla pagina giusta (Search Console, Google Cloud, Drive, credito Claude,
  GitHub, ricarica DataForSEO) + tasto «Chiavi in Cloudflare». Le chiavi restano SOLO in Cloudflare.
- Tetti di spesa: ✏️ Modifica (`AC.ed="caps"`) → POST /api/account {caps:{maps,sott}} → tabella gbp "cfg:caps". Letti da
  `capsCfg(env)` (_lib.js) in maps.js, public/budget.js e account.js; se mancano valgono MAPS_CAP/SOTTOSOPRA_CAP, poi 100/30. 0 = fermo.
- Chi entra: ✏️ Modifica (`AC.ed="people"`, bozza in `AC.pp`) → POST /api/account {people:{email:"admin"|"conti"|"viewer"}} →
  gbp "cfg:access". `role()` (_lib.js, cache 30 s, `accessReset` dopo il salvataggio): se l'elenco c'è decide SOLO lui e chi non
  c'è riceve 403; se non c'è ancora valgono CONTI/VIEWERS e tutti gli altri admin (come prima). Chi salva resta sempre admin.
  Perché funzioni anche per persone nuove, Cloudflare Access deve far passare chiunque abbia un'email (codice via email):
  il filtro vero è l'elenco del gestionale.

## 👥 Permessi per sezione (08/10/2026, scelta di Paolo)
- In ⚙️ Account → Chi entra, per ogni persona e per ogni voce del menu: No (0) / Vede (1) / Modifica (2); Oggi, Traduci e
  Statistiche al massimo 1 ("Usa" per Traduci). Scelte rapide Niente / Vede tutto / Modifica tutto. Account resta solo di Paolo.
  `AC_SECT`, `AC_ONE`, `acPermTxt`, `acPpRead`, azioni `acPpSet`/`acPpAdd`/`acPpDel`. Salvato in gbp "cfg:access" come
  `people[email] = "admin" | {sezione:1|2}` (`permNorm`; i vecchi "conti"/"viewer" = {conti:2} / {cani,cucciolate,coi,attesa:1}).
- Server (_lib.js): `who()` → {email, role:"admin"|"limited"|null, perm}; `role()` ora dà "admin"/"limited"; `can(req,env,sezione,livello)`.
  `GET /api/data` per "limited": `limitedData` (senza Proprietari: famiglie solo col nome, niente contratti/caparre/passaggi/documenti
  privati; senza Conti: niente acc/accGen; senza Attesa: niente waitlist/interessati; senza Agenda: niente agenda; settings solo
  le voci delle sezioni viste, MAI sellerSig) + `perm`. `PUT`: `mergeLimited` prende dai dati mandati SOLO le parti delle sezioni
  con 2 (campo per campo nei cani: health/todo → Scadenze, anag → Anagrafe, contract/dep/pp/owner → Proprietari, nascita/pesi/foto
  → Cucciolate; tutto il resto → Cani); il resto resta quello vero. Altri endpoint con `can`: contracts (proprietari 1), sbt
  (cani/coi 2), requests (attesa 1/2), publish (cucciolate/cani 2), reviews e posts (recensioni 1/2), sitestats (statistiche/oggi 1),
  maps GET (statistiche 1; il controllo che spende solo Paolo), ai (compito per compito, `NEED`), upload (chi modifica qualcosa).
- Pagina: `window.PERM`; menu solo con le voci viste; a ogni `render()` `RO = PERM[tab]!==2` (tasti di modifica tolti da
  `roClean`, fascia "Solo da guardare"); `saveNow` salva se c'è almeno una sezione con 2. Se l'unico permesso è Conti=2 si
  comporta come il vecchio ruolo "conti" (`CONTI`). Un 403 delle altre API non mostra più "Accesso scaduto" a chi ha permessi limitati.

## 🏠 Dati dell'allevamento: una sola fonte (08/10/2026, scelta 2 di Paolo)
- REGOLA: nome dell'allevamento, titolare, indirizzo, telefono, email, sito e razza NON si scrivono mai a mano nel codice.
  Nelle pagine: `FM()` (in cima allo script di index.html e proprietario.html, blocco identico) = `FARM_DEF` + `D.settings.farm`.
  Campi: name, first, last, street, num, cap, city, prov, provName, phone, prefix, email, site, breed, since; derivati: person,
  personRev, kennel ("Allevamento …"), kennelEn, addr, cityProv, capCity, full, phoneDigits, phoneIntl, siteUrl, mapUrl.
  Lato server: `farmOf(data)` / `farmRaw(data)` in functions/_lib.js (stessi valori di partenza di `FARM_DEF`: se cambi uno,
  cambia anche l'altro).
- Si cambiano in ⚙️ Account → 🏠 Allevamento → Modifica (`AC.ed="farm"`, campi `acf_*`): si salvano in `settings.farm` solo i
  campi diversi dai valori di partenza; un campo vuoto torna al valore di partenza. `fmBrand()` (a ogni render) aggiorna la
  scritta in alto e il titolo della finestra.
- Usati in: contratto (HTML e PDF, `CT_DEL_F()`), Modelli A e B, email ENCI, ricevuta della caparra (luogo e data di nascita da
  `settings.ppMe` o `settings.holders.paolo`), anagrafe e passaggi di proprietà (`PP_WHY_F()`), messaggi WhatsApp e email,
  Agenda (`AG_ADDR_F()`, `AG_MAP_F()`), Drive (`DR_ROOT_F()`), sito (`SITE_F()`), Diario, istruzioni dell'allevatore, Oggi,
  intestatari di base (`ANAG_DEF` con getter), pagina del proprietario (`ownerSubset` ora manda `settings.farm`; anche
  `viewerData` e `contiData`), pagina pubblica della coppia (`farm` nella risposta di /api/public/coppia), calendari (.ics),
  copie di sicurezza, prompt di Claude (ai.js: `voice(F)`, legge i dati da D1).
- Restano scritti nel codice di proposito: "foro competente di Ferrara" nel contratto (testo legale: Paolo non vuole toccare il
  contratto), nomi degli zip del sito (delpiccolodiavolo-*.zip), UID dei calendari, commenti.

## Passaggi all'anagrafe un po' alla volta (10/10/2026, scelte di Paolo)
- Scheda della cucciolata → Passaggi di proprietà: partono solo i passaggi firmati NON ancora mandati (`d.ppSent` = data;
  `ppToSend`, `PP_ALL` = «Rimanda anche quelli già mandati»). Stato su ogni riga: ✍️ Da firmare / ✅ Firmato · da mandare /
  ✉️ Mandato il …; tasto «Manda all'anagrafe i N nuovi».
- Un PDF per famiglia (`ppPack`): il passaggio firmato + i documenti d'identità del suo proprietario (`owners[id].ids`), nome
  «Passaggio di proprieta - <cucciolo> - <proprietario>.pdf». Il documento di Paolo NON va più (scelta di Paolo).
- Dopo l'email `ppSentAsk`: «Il messaggio è partito?» → solo con «✓ Sì, l'ho mandato» (`ppSentYes`) si scrive `d.ppSent`.
- (10/10/2026, dopo) «Chi mando all'anagrafe?» (`ppMailAsk`): una riga per cucciolo con casella (`input[data-pp]`; di partenza i
  firmati non ancora mandati; i da firmare disattivati), scelte rapide Tutti i firmati / Solo i nuovi / Nessuno (`ppSel`),
  «👁 Vedi» (`ppView`: apre il PDF di quella famiglia, finestra aperta subito poi `location.href` del blob), tasto «Prepara
  l'email con N passaggi» (`ppCount`) → `PP_SEL` = chiavi spuntate → un'unica email. PDF di una famiglia in `ppFamPdf`.
- (10/10/2026, ancora dopo, scelta di Paolo: «senza la finestra in più») caselle, «👁 Vedi», Seleziona Tutti/Solo i nuovi/Nessuno
  e i tasti «✉️ Manda all'anagrafe N passaggi» / «⬇️ Scarica N PDF» stanno direttamente nella lista di `ppLitBox`; il tasto
  `ppMail` chiama subito `ppMailGo` (niente più finestra `ppMailAsk`, rimasta nel codice ma non usata). `ppCount` aggiorna i tasti.
- «✍️ Firma ora» (10/10/2026) sui cuccioli da firmare della lista: `ppSignNow` → `PP_BACK` = cucciolata, apre `ppForm`; dopo
  `ppGo` riapre la Scheda della cucciolata (`litterSheet(PP_BACK)`). Da «Compila e firma» nella scheda del cucciolo `PP_BACK` = null.

## Email dal computer: Gmail, non Outlook (10/10/2026, scelta di Paolo)
- `mailGo(u)` (blocco comune): sul telefono `location.href=mailto` (Gmail o Edison Mail, quello del telefono); sul computer apre
  Gmail nel browser `gmailUrl(u)` = mail.google.com/mail/?authuser=<email dell'allevamento>&extsrc=mailto&url=<mailto>. Tutti i
  `location.href="mailto:…"` passano da lì; i link `<a href="mailto:">` sono presi da un gestore dei clic. Se il browser blocca la
  finestra compare «📧 Apri Gmail»; nei passaggi all'anagrafe «Il messaggio è partito?» ha anche «📧 Apri l'email in Gmail».
  Nella pagina delle famiglie (OWNER_MODE) resta mailto. Nuove email: usare sempre `mailGo`.
- (10/10/2026, sera) Un unico allegato: `ppPack` unisce in un solo PDF «Passaggi di proprieta - <madre> x <padre> - <data>.pdf»,
  nell'ordine della lista, per ogni cucciolo spuntato il passaggio firmato seguito dal documento del proprietario (`ppFamPdf`
  resta per «👁 Vedi»).

## Statistiche, recensioni e post (12/10/2026, scelte di Paolo)
- Sito web → Ricerche: posizione media «pulita» (`wsClean`: senza le ricerche col nome `WS_MINE` e senza quelle escluse col 🚫,
  salvate in gbp "gsc:ex" con `POST /api/sitestats {task:"ex"}`); in piccolo quella di Google. Le escluse e quelle col nome NON si
  vedono (né tabella, né salita/discesa, né grafico del profilo): solo il tasto «🚫 Ricerche escluse (N)» apre la lista con ↩ rimetti.
- Ricerche del profilo: grafico «versione C» con 28 gg (= ultimo mese intero) / 3 / 6 mesi / 1 anno (`?only=gbpk&km=`), prime 6 e
  «Mostra le altre» (`WS.kwAll`); i mesi chiusi da oltre 40 giorni restano in gbp "kw:AAAA-MM".
- WhatsApp: contano SOLO i tocchi partiti da una pagina del sito (path presente, esclusa /prova-diag/); le aperture di /wa/ da fuori
  dal sito si contano a parte con la provenienza (colonna `src` di `wa`, mandata dalla funzione /wa/ del sito; i precaricamenti
  del browser non contano). Riquadro compatto «versione H» (`wsWaHtml`, nomi pagine `wsPgName`).
- Recensioni: si apre su «Ultime arrivate»; «Nuova» (verde) = senza risposta finché non rispondi; «vecchie» = senza risposta e più
  vecchie di un anno (`rvOld`): nascoste (solo in «Tutte»), niente risposte di Claude, fuori dal numero del menu.
- Scrivi un post: caricata la foto, Claude la legge (compito `foto` di /api/ai → riquadro «Claude vede nella foto»); lo spunto è
  facoltativo; «Scrivi il post» manda a Claude foto + spunto + descrizione (`post` con `key`, `seen`).
- Post pubblicati (12/10/2026): l'elenco legge TUTTI i post (pagine da 100); tocco = il post com'è su Google (`gpView`: foto, testo
  intero, «Scopri di più»), «↗ Apri su Google» (searchUrl) e «🗑 Elimina da Google» con conferma (`gpDel` → `POST /api/posts
  {task:"del",name}` → DELETE v4; solo post della scheda in gbp "loc").
- 🙂 Copri i visi (12/10/2026, scelta C di Paolo): tasto sotto la foto scelta nei post (proposte e «Scrivi un post», `gpFaceBtn`) →
  `vzOpen`: i visi trovati si sfocano da soli (face-api SSD in `public/vendor/visi/`, scaricato solo quando serve, la foto non esce dal
  telefono; visi piccoli cercati anche a pezzi ingranditi), poi pennello 🖌 Copri / 🧽 Scopri, Annulla, Ricomincia, intensità
  Leggera/Media/Forte (parte da Media). Sfocatura = foto rimpicciolita e ingrandita (niente pixel), con maschera morbida.
  «Usa questa foto» carica la versione sfocata (`uploadData`) e la mette al posto dell'originale in `GP.up`.
- Post con i dati del gestionale (12/10/2026): `gpFacts(spunto)` riconosce famiglie (nome+cognome del proprietario, anche invertiti,
  senza accenti) e cani (soprannome o nome completo) e manda a Claude `facts.dal_gestionale` (nome di chiamata, sesso, età, genitori,
  cucciolata, ritiro dall'Agenda o data del passaggio, città e paese della famiglia senza via, fratelli). Sotto lo spunto «🔎 Dal gestionale: …». Nel post le persone non si nominano mai (solo «la sua famiglia»).
- Foto dei post pubblicati (12/10/2026): sul telefono le miniature di googleusercontent restavano grigie; ora passano da
  `GET /api/postimg?u=` (functions/api/postimg.js: solo https googleusercontent.com/ggpht.com, solo chi vede Google) con `gpImg()`.

## 🎬 Video nei post (13/10/2026)
- Google → Post → «✍️ Scrivi un post» → riquadro «🎬 Aggiungi video» (input `.gpVid`) → finestra `vdOpen`: si sceglie il pezzo
  (inizio, durata 10/15/20/30 s, «togli l'audio») e «Prepara» (`vdGo`): il telefono lo rifà con canvas + MediaRecorder (MP4 se
  possibile, 720p sul lato corto, 3,5 Mbps) e tiene un fotogramma. «✓ Usa nel post» (`vdUse`) carica video e fotogramma su R2
  (`/api/upload` ora accetta video/mp4, webm, quicktime fino a 80 MB) → `GP.vid`, `GP.free.photo=-2`. Claude guarda il fotogramma.
- Pubblica: `POST /api/posts {video}` → media VIDEO via `/api/public/gpost/` (che ora risponde anche a Range). Se Google lo
  rifiuta (`{ok:false,video:true}`) la pagina chiede se pubblicare con il fotogramma come foto; «⬇️ Salva il video» (`vdSave`,
  condivisione sul telefono) per metterlo a mano dal profilo Google. La pagina di prova `prova-video.html` è stata tolta.
- Claude che risponde senza JSON (13/10/2026, «Unexpected end of JSON input» riscrivendo un post): `ask` in ai.js riprova una volta
  da solo (`ask1`, errore `noJson`); se ancora niente: «Claude ha risposto in modo strano. Riprova tra un attimo.» Vale per tutti i compiti.
- (13/10/2026, dopo) Il post continuava a non riscriversi: `ask1` ora salva il testo anche da risposte imperfette (JSON con a capo
  dentro, JSON tagliato, solo parole → `{text}`), il post ha 1500 token invece di 700, e l'errore finale dice il motivo di Claude
  (`stop_reason` e inizio della risposta) per capire cosa succede.
- (13/10/2026) Peso dei video: Google li vuole sotto ~25 MB (prima si puntava a 75; il primo video di Paolo pesava 32 MB e Google ha
  risposto 500). `vdGo` calcola la qualità per stare sui 20 MB (`VD_GOAL`); se esce oltre 24 MB (`VD_MAX`, Safari a volte non rispetta
  la qualità chiesta) lo rifà da solo più leggero una volta; se pesa ancora troppo, niente «Usa nel post» e chiede una durata più corta.
  Non è sicuro che le API dei post accettino i video: se Google rifiuta resta il ripiego sul fotogramma + «Salva il video».
- (13/10/2026) Google NON accetta video nei post via API («Video uploaded from post is not currently supported», anche sotto i
  25 MB). Scelta di Paolo: col video scelto nel post non c'è più «Pubblica su Google», solo «⬇️ Salva il video» (il gestionale
  prepara il video per GBP e Claude scrive il testo; Paolo pubblica a mano dal profilo). Il ramo `video` di api/posts.js resta ma
  la pagina non lo usa più.
- (13/10/2026, «troppi passaggi») Voce **🎬 Video** nel menu Google (`RV.sub="vid"`, `vdPage`): «Scegli il video» → stessa finestra
  `vdOpen(file,solo)` → Prepara → solo «⬇️ Salva il video» (niente «Usa nel post», niente caricamento su R2). Resta anche il video
  dentro «Scrivi un post» per chi vuole il testo di Claude.
- (13/10/2026, scelta di Paolo) Tolto «🎬 Aggiungi video» da «Scrivi un post»: i video si fanno solo da Google → 🎬 Video.
  Le funzioni del video nel post (`GP.vid`, `vdUse`, `gpVidDel`) restano nel codice ma non si raggiungono più.
- (13/10/2026, Paolo: «nella sezione video aggiungi testo e post per GBP») Google → 🎬 Video: dopo «Prepara» → «✓ Usa questo
  video» (`vsAct` vsUse, `VD.used`) la pagina (`vdPage`) mostra il video pronto, lo spunto (`VS.idea`), «✨ Scrivi il post» (`vsWrite`:
  carica su R2 solo il fotogramma per Claude, compito `post` con `gpFacts` come «Scrivi un post»), il testo modificabile con i
  controlli (`gpChecks`), «📋 Copia il testo», «⬇️ Salva il video», «Nuovo video». La pubblicazione resta a mano dal profilo Google.

## Modello A/B: email dal computer con il PDF già allegato (15/10/2026, Paolo)
- Problema: "Email alla delegazione" apriva Gmail senza allegato e il PDF non finiva nei Download.
- Ora dal computer (`!isPhone()`) `encMail` → `gmDraft`: accesso Google (stesso client di Drive, permesso
  `gmail.compose`, token `GM_TOK`) e BOZZA Gmail con destinatario, oggetto, testo e PDF allegato; finestra `gmReady` con
  «📧 Apri l'email in Gmail» (link vero, #drafts?compose=<id>) e «📥 Scarica il PDF». Nulla parte da solo: Paolo preme Invia.
- Se Gmail risponde errore (API Gmail non attiva nel progetto Google Cloud del client Drive) torna la strada di prima:
  scarica + Gmail da compilare, con avviso.
- Nuovo bottone «📥 Scarica nei Download» (mode "dl") nei riquadri Modello A e B; `dlUrl(url,name)` per tutti gli scarichi.
- I link «Scarica» dei file salvati (`a.fb-dl[href^='/files/']`) ora scaricano via fetch → blob (non si aprono nel browser).
- (15/10/2026, anteprima approvata) Riquadri Modello A e B semplificati con `encBoxH`: stato in cima (⏳ arancione / ✅ verde),
  4 bottoni Vedi · Scarica · Email a Cristina · WhatsApp a Cristina, casella «Consegnato alla delegazione» (mode "done" ora
  spunta/toglie, senza conferma), link «✏️ Correggi i dati» (solo B → mbForm). Tolti Salva e la riga "salvato il…":
  `encAuto` salva il PDF da solo quando si scarica o si manda. mbForm ha gli stessi 4 bottoni + casella + Chiudi.

## Niente numero di cuccioli sul sito (15/10/2026, Paolo)
- "Non voglio spiattellare quanti cuccioli faccio": il sito non mostra mai quanti cuccioli, maschi o femmine sono nati.
  Tolti da cucciolate.html (Hugo e JS), ultima-cucciolata-scheda.html (resta solo "Colori"), front matter scheda.maschi/femmine
  dei diari Bilquis, riga vuota "Geborene Welpen" del diario Red Nora DE. Il gestionale non manda più n/m/f e non li scrive nei testi.

## Il proprietario scrive sulla scheda del suo cane (16/10/2026, anteprima approvata: "tutto")
- Interruttore «Il proprietario può scrivere» nella scheda del cane (riquadro «📝 Dal proprietario», `owpBox`): `d.ownW`, spento
  per tutti finché Paolo non lo accende. Tipi: foto e video, peso, vaccino, vermifugo, visita dal veterinario, esposizione, referto.
- Dati a parte, tabella D1 `ownerposts` (id, dog, owner, json, created, seen): non toccano mai lo store 'main' di Paolo.
  Proprietario: `GET/POST/DELETE /api/public/<token>/posts` (solo i suoi cani con ownW; toglie solo le sue voci) e
  `POST /api/public/<token>/upload?dog=` (R2, chiave "o…", metadato owner; foto ridotte a 2000 px nel telefono, video max 80 MB).
  I suoi file si vedono da `/api/public/<token>/f/<key>` (metadato owner). Paolo: `GET/POST(seen)/DELETE /api/ownerposts`, file da /files/.
- Paolo: avviso «🔔 Novità dai proprietari» in Cani e Oggi (`owpBanner`), le voci si segnano viste quando apre la scheda;
  🗑 cancella voce e file. Pagina del proprietario: «📝 Aggiungi tu» con 7 bottoni e finestrella (`owpOwnerHtml`, `owpForm`, `owpSave`).

## 📲 Pagina del proprietario sulla schermata Home (16/10/2026, anteprima approvata)
- Bottone in cima «Metti <cane> sulla schermata Home» (`owHomeBar`), solo sul telefono, non se già aperta dall'icona, non dopo «Non ora»
  (localStorage owHomeOff). Android: finestra di installazione (beforeinstallprompt, `window.OW_BIP`), se manca istruzioni ⋮.
  iPhone: Apple non lo permette ai siti → finestrella con 3 tocchi (`owHomeIOS`).
- Manifest per link segreto: `/api/public/<token>/manifest` (nome del cane, start_url e scope /p/<token>); meta apple-* nel <head>.

## 🍖 Quanto mangiare (18/10/2026, anteprima approvata: stile B «plastico» con i colori del gestionale)
- Voce di menu propria «Quanto mangia» (tab "pappa", `fdPage`, 18/10/2026: Paolo vuole una voce indipendente, non nella scheda del cane):
  si sceglie un cane (FD_PICK) oppure «Nessun cane» (`_free`, D.settings.feedFree con data di nascita e peso scritti a mano).
  Riquadro `fdBox`/`fdDraw`. RER 70×kg^0,75 × fattore (3 fino a 3 mesi → 2 a 6 mesi →
  1,8 intero / 1,6 sterilizzato a 12 mesi; 8+ anni 1,4) × movimento (0,85/1/1,25/1,6). Tabella ogni mezzo mese 2–6 mesi, poi mensile
  fino a 12, adulto, anziano; peso per età = quota del peso adulto previsto (`FD_G`). Pasti 1–5 con «consigliato» (3 fino a 6 mesi, poi 2: come FAQ e Alimentazione iniziale del sito).
- `d.feed` = {food, act, ster, meals, kg?, adult}. Elenco `FD_DB` (34 crocchette taglia media, kcal/100 g; "p" produttore, "c" calcolate)
  + `D.settings.foods` (aggiunte da Paolo). ✏️ a mano (kcal o componenti → Atwater modificato), 📷 foto del sacco: task AI "sacco"
  (kcal scritte o calcolate dai componenti); se c'è solo il nome: prima l'elenco, poi task "kcalnome" con la ricerca web di Claude.
- Da mettere sul sito per tutti (IT/EN/DE) quando Paolo dice che è perfezionato.
- 📷 dal sito (18/10/2026, Paolo scelta A): `POST /api/public/sacco` (solo Origin delpiccolodiavolo.it, CORS) legge la foto del sacco
  con Claude; limite 30 letture al giorno per tutti e 3 per visitatore (tabella `sacco`, impronta = hash di IP+giorno, IP non salvato,
  righe più vecchie di 7 giorni cancellate). Foto non salvata. Se non c'è kcal né componenti, ricerca web dal nome.
- 18/10/2026 (Paolo: "sistema anche sul gestionale"): uguale al calcolatore del sito. Senza cane: età da elenco `FD_AGES`
  (o data di nascita, `feed.mode="date"`), peso a occhio o per taglia (`FD_SZ`, femmina ×0,9). Sesso (dal cane, cambiabile),
  figure del cane visto dall'alto (`FD_DOGS`, `feed.bcs` −1/0/1 = +10%/0/−10%), crescita più lunga nei cani grandi (`fdFine`,
  `fdEq`), tre riquadri numerati, kcal al giorno, «Stampa o salva in PDF» (`fdPrint`, body.fd-print) e «Ricomincia» (`fdReset`;
  con un cane tiene solo le crocchette). Con un cane: età dalla nascita, peso da adulto dall'ultima pesata se ha 18+ mesi.
- 18/10/2026 (Paolo: cucciolata di Billy, Maris in inglese; "dammi la possibilità di condividere o meno"): **«Quanto mangia» nella
  pagina del proprietario**, cane per cane (`d.ownFeed`, interruttore sotto «Il proprietario può scrivere» in `owpBox`, più il bottone
  per tutti i cuccioli con proprietario della stessa cucciolata). In `proprietario.html` è il calcolatore del sito (italiano/inglese
  secondo `owner.lang`), portato in `owFdMount` (classi `po-*` per non scontrarsi con `.pp-*` dei contratti, id con prefisso per cane),
  già compilato con nascita, sesso, ultima pesata e peso da adulto tipico dello Staffy (16 kg maschio, 14 femmina) se non ha ancora
  18 mesi. Le scelte restano nel telefono del proprietario (localStorage `owFeed_<id>`), i dati di Paolo non cambiano. Elenco:
  copia di `FD_DB` in proprietario.html (**aggiornare insieme**). Foto del sacco: `/api/public/sacco`, che ora accetta anche
  l'origine del gestionale (stessi limiti: 30 al giorno, 3 per persona).
- 18/10/2026 (Paolo: "una sorta di database, in automatico, dopo un tuo controllo"): **elenco comune delle crocchette**. Chi aggiunge
  una crocchetta (sito, pagina del proprietario, gestionale) la propone a `POST /api/public/crocchette` (functions/api/public/crocchette.js,
  origini sito e gestionale). Claude (con ricerca web) controlla che il prodotto esista e che le kcal tornino entro il 7% con il produttore
  o con i componenti, sistema marca e nome (anche in inglese): "ok" → tabella D1 `crocchette` status ok, visibile a tutti con
  `GET /api/public/crocchette`; "no" → resta solo a chi l'ha scritta. Limiti: 20 controlli al giorno in tutto, 5 proposte per visitatore
  (tabella `crocch_lim`, hash IP+giorno); stessa proposta già scartata o tolta → niente nuovo controllo. Paolo: Quanto mangia →
  «👥 Crocchette aggiunte dagli utenti» (`fdUList`, `GET/POST /api/crocchette`: 🗑 Togli = status del, ✓ Metti nell'elenco).
  Nel gestionale le accettate stanno in `FD_U` (gruppo «Aggiunte dagli utenti (controllate)», src "u").
- 18/10/2026 (Paolo: "quando si sceglie un sacco o lo si aggiunge vorrei vedere i componenti analitici"): sotto la scelta delle
  crocchette il riquadro «Componenti analitici» (proteina, grassi, fibra, ceneri, umidità + carboidrati calcolati; `fdCmpHtml`, nel
  calcolatore del proprietario `cmpHtml`, classe `po-cmp`). Dati: 6° elemento di `FD_DB` `c:[p,f,fi,a,u]` (null se non pubblicato),
  presi dai siti dei produttori o da Zooplus il 18/10/2026; crocchette aggiunte: dai campi dei componenti o dalla foto
  (sacco.js ora restituisce anche p,f,fi,a,u); elenco comune: colonna `comp` della tabella `crocchette` (Claude riporta i componenti).
- 18/10/2026 (Paolo: "tener conto della % di proteine soprattutto per i cuccioli"): la razione resta calcolata sull'energia; sotto i
  grammi la riga «Proteine: X g al giorno · Y g ogni 1000 kcal» con il controllo dei minimi FEDIAF (62,5 fino a 14 settimane,
  50 in crescita, adulto 45 o 52,1 se sterilizzato/tranquillo) e l'avviso se è sotto (`fdProt`, nel calcolatore del proprietario `protHtml`).
- 18/10/2026 (Paolo: "se ti scrivo il nome giusto devi trovare tu i dati"): nel modulo per aggiungere una crocchetta il tasto
  «🔎 Trova kcal e componenti dal nome» (`findName` nel calcolatore del sito/proprietario, `fdFind` nel gestionale): prima cerca
  nell'elenco, poi `POST /api/public/crocchette {find:true,name}` (`findByName`: Claude con ricerca web; trovato → entra subito
  nell'elenco comune, src "w"). Stessi limiti dei controlli (`overLimit`).
- 19/10/2026 (Paolo: "cataloga tutti i prodotti Monge"): **catalogo** `public/crocchette-catalogo.json` (`{items:[{id,brand,name,en,kcal,src,c,url}]}`),
  preparato da Claude dalle schede tecniche PDF dei produttori: 77 crocchette secche Monge (Natural Superpremium, BWild, Gemon,
  Special Dog Excellence, Special Dog); kcal del produttore ("p") o calcolate dai componenti ("c", umidità 10%). Lo leggono:
  `GET /api/public/crocchette` (via `env.ASSETS`, prima delle aggiunte degli utenti → sito e pagina del proprietario) e il gestionale
  (`FD_CAT`, `fdLoadCat`, un gruppo per marca). Per aggiungere un altro produttore: nuove voci nel file (id "cat_…" unici).
  19/10/2026: + 131 Farmina (N&D Ancestral Grain, Pumpkin, Prime, Quinoa, Ocean, Tropical Selection, Spirulina, White, Brown, Cibau,
  Ecopet Natural, Team Breeder, Top Farmina) dalle pagine farmina.com/it (nomi tradotti in italiano dal titolo inglese).
  Poi (scelta di Paolo: marche di qualità, niente Royal Canin/Purina/Hill's/Trainer): Carnilove, Brit Care, Acana, Orijen, Forza10
  (senza la linea dietetica Active), Oasy (senza la gamma Grain Free precedente). Diete veterinarie escluse ovunque.

## ✍️ Attestato del Comune firmato col telefono (20/10/2026, anteprima approvata da Paolo: "Ok")
- 🪪 Anagrafe → pratica del cane → riquadro «Attestato del Comune» (`attHtml`): l'attestato di iscrizione rilasciato dal Comune è un
  documento del cane con `anAtt:true` (privato). Caricato con «📎 Carica l'attestato del Comune» (`attLoad`, segna anche iscritto)
  o con "Importa modifiche" `{attestatoAnagrafe:[{chip,name,birth,date,fname,file,anag:{…}}]}` (`importAtt`: campi di `anag` solo dove vuoti).
- Manca la firma dell'intestatario (es. Daniela per Tikus): «💬 Manda a … su WhatsApp» / «📋 Copia link» (`attSend`/`attCopy`/`attPrep`)
  creano `d.anag.sigTok` (24 caratteri) e `sigSent`; link **/p/firma/<sigTok>** (dentro il bypass di Access di `/p`).
- Pagina `public/firma.html` (servita da `functions/p/firma/[tok].js`): mostra la pagina 1 con pdf.js (cdnjs) e i punti gialli,
  chi firma disegna la firma una volta + spunta «Sono … e firmo …»; pdf-lib (da `/api/public/firma/<tok>/lib`, che gira
  `/pdf-lib.min.js` fuori da Access; riserva cdnjs) mette la firma in tutti i punti, anche su pagine ruotate (provato 0/90/180/270:
  l'attestato di Ostellato è una scansione con /Rotate 270). Punti: `ATT_SPOTS` in index.html = `SPOTS` in
  functions/api/public/firma/[tok].js (frazioni della pagina vista dritta; **aggiornare insieme**), o `d.anag.sigSpots`.
- API pubbliche (solo con il link): `GET/POST /api/public/firma/<tok>` (info / invio PDF firmato + firma PNG; una volta sola, 409 dopo),
  `GET …/pdf` (originale da R2), `GET …/signed` (PDF firmato). Tabella D1 **`firme`** (tok, dog, json {key,name,sig,at,hash,ip,ua},
  signed_at), creata da sola (`ensureFirme`); non tocca lo store `main`. `firmaFind` in _lib.js.
- Il gestionale legge `/api/firme` (`attCheck`, permesso anagrafe ≥1): da solo quando si apre la pratica o l'Anagrafe con un link
  mandato, o con «↻ Ha firmato?»; aggiunge ai documenti `{title:"Attestato firmato da <nome>",anAttS:true,private:true}` e
  `d.anag.attSigned {file,at,name}`. L'originale resta. Nell'elenco dell'Anagrafe «✍️ manca la firma» finché non è firmato.

## «Sono … e firmo …» su tutti i documenti da far firmare (20/10/2026, Paolo: «va bene come questa», cioè come l'attestato)
- Prima di firmare, chi firma spunta una casella con nome e documento, come nella pagina della firma dell'attestato (`firma.html`):
  contratto di cessione (pagina della famiglia, `ctme_<id>` sotto «Ho letto il contratto…», il nome segue il campo `ctb_name`
  mentre si scrive, controllo nel gestore `data-ct="sign"`; in inglese «I am … and I sign the sale agreement for …») e passaggio di
  proprietà (`ppDecl` in `ppForm`, la spunta la mette l'acquirente; controllo in `ppGo`). Niente riga in più nei PDF (scelta di Paolo).
- Ogni nuovo documento da far firmare deve avere la stessa casella. In `firma.html` l'articolo davanti al titolo lo mette `art()`.

## Controllo del codice (20/10/2026, chiesto da Paolo: «studia se ci sono errori»)
- Pagine: il controllo «dati non salvati» del tasto indietro (`popstate`) non partiva (era finito dentro un commento);
  `todayS()` ora usa la data italiana (prima UTC: fra mezzanotte e le 2 dava ieri), e tutte le `new Date().toISOString().slice(0,10)`
  per «oggi» passano da `todayS()`; righe di ⚙️ Account con classe `.acx-r` (prima `.ac-r` rompeva le righe dei Conti).
- Server: `ownerSubset` toglie dalla cucciolata `LIT_PRIV` (note, Modello A/B con i dati di tutti gli acquirenti, sito…) e dal
  cane `anag`; `limitedData` toglie Modelli A/B senza Proprietari e `anag` senza Anagrafe; un errore di D1 in `accessCfg` ora
  blocca l'accesso (prima: tutti admin per 30 s); chiavi di Access riscaricate se la chiave del token non c'è; PUT /api/data
  blocca solo i veri `data:…;base64,` (prima anche una nota che inizia con «data:») e risponde 400 al JSON rotto;
  `GET /api/ownerposts` solo con Cani, Proprietari o Oggi; publish.js protegge sempre i file `content/`; contratto: versione
  mai più vecchia di `CT_MIN` (2026-10b), così dal browser non si toglie il 4-bis. **Se cambia `CT_VER`, aggiornare `CT_MIN`.**

## Finestre che non perdono i dati (20/10/2026, anteprima approvata da Paolo)
- Un tocco fuori dalla finestra (`#sheetBg`) non la chiude più: avviso «Per chiudere tocca ✕ in alto».
- `SH_DIRTY` (input/change/firma su canvas.pad dentro `#sheet`; si azzera in `sheet()` e `closeSheetRaw()`): la ✕ (`data-a="shX"`)
  e il tasto indietro (`popstate`) chiedono con `askLeave(fn)` («💾 Torna a salvare» / «Esci senza salvare», `#lvAsk`, `.lv-*`).
  «Annulla»/«Chiudi» dentro le finestre chiudono senza chiedere (si premono apposta).
- `leaveOk(retry)` (uscita da Modifica di un cane/proprietario non salvata): stessa domanda al posto di `confirm`; con «Esci»
  rifà l'azione (`go`, `openItem`, indietro…). Blocco comune: identico in index.html e proprietario.html.

## 🌡️ Temperatura prima del parto (20/10/2026, anteprima approvata da Paolo; idea dall'app Breedera)
- Scheda della fattrice, subito sotto «Calori e monte» (`tpHtml`, chiamato da `reproHtml`): compare da solo dal giorno 55 della
  gravidanza (o con misure già fatte dopo la monta) fino alla nascita. `d.temps=[{at:"AAAA-MM-GGTHH:MM",v}]`; modulo con Salva
  (`tpAdd`), ✕ per togliere una misura (`tpDel`), grafico SVG (`tpChart`, fascia 38–39 °C, riga rossa a 37 °C) ed elenco.
- Calo (`tpState`): ultima misura ≤ media delle 6 precedenti − 0,9 °C, oppure sotto 37 °C → riquadro rosso «parto entro 12–24 ore».
- ☀️ Oggi: con il calo un riquadro rosso in cima (`og-alarm`, tasto «Apri la scheda»); prima del calo nella card Fattrici la riga
  «🌡️ … misura la temperatura (giorno N)».

## 📜 Pedigree per la famiglia e finestre della cucciolata (20/10/2026, anteprima approvata da Paolo)
- Scheda del cane allevato (`pedBox`, dopo la Consegna): «👁 Vedi / ⬇️ Scarica / 💬 Manda alla famiglia» (`pedGo`). `pedPdf` (jsPDF,
  A4 orizzontale): logo `/icon-192.png`, allevamento e razza da `FM()`, nome, nome di chiamata, sesso, nascita, mantello, microchip,
  LOI («In attesa»), 4 generazioni dai dati (genitori con titoli, LOI e test; nonni con titoli; bordo azzurro/rosa per posizione;
  «–» se manca), COI SBT (`pedCoi`: cane, cucciolata `sbtA.c8`, coppia), firma salvata, «documento informativo: il pedigree
  ufficiale è quello dell'ENCI». Inglese per i proprietari `lang:"en"`. Non si salva: si rifà ogni volta. Sul telefono «Manda»
  usa il pannello Condividi col PDF; dal computer scarica e apre WhatsApp col messaggio.
- Finestre aperte dalla Scheda della cucciolata (`SH_PARENT`, calcolato in `sheet()` dal `CK_LIT` della finestra precedente):
  in alto «‹ Scheda della cucciolata» (`shBack`) e la riga «Cucciolate › madre × padre › titolo» (`.sh-crumb`); ✕, Annulla/Chiudi
  (`close`) e il tasto indietro riportano alla Scheda della cucciolata (`shBackTo`) invece di chiudere tutto.

## Cane acquisito, barra in basso, ordine di scelta (20/10/2026, anteprima approvata da Paolo)
- 🪪 Anagrafe → «＋ Cane acquisito» (`anagNew`): una sola finestra con nome di chiamata, nome di pedigree (vuoto = uguale) e i
  bottoni ♂/♀ (`annSx`, `ANNEW_SX`); «Salva e apri la pratica» (`annSave`). Niente più prompt/confirm dell'iPhone.
- ⚙️ Account → «📱 Barra in basso sul telefono» (`acNbHtml`, `acNbAct`, bozza `ACNB`): Paolo tocca fino a 4 voci nell'ordine
  voluto → `D.settings.navBar`; `navOrder()` le mette prime in `nav()` (barra in basso), le altre in «Altro». «Come prima» toglie
  `navBar`. Voci non permesse (permessi per sezione) vengono saltate da sole. La barra laterale del computer non cambia.
- Attesa → in ogni cucciolata «🎯 Ordine di scelta» (`poHtml`, `poList`): chi ha `status` deposit/assigned in fila; `l.pick` =
  ordine con ▲▼ (`poMv`), altrimenti per `depDate` e poi `created`. Chi ha il cucciolo ✓ «ha scelto …», il primo senza è «tocca a
  lui/lei» con «🐶 Assegna un cucciolo» (`wlAssign`, come prima); sotto i cuccioli, barrati quelli già presi.

## Scheda del cane più semplice (20/10/2026, anteprima approvata da Paolo)
- Percorso «dove sono» sopra il tasto indietro di ogni pagina interna (`navCrumb`/`navDecor`, classe `.pg-crumb`): ultime voci di
  `NAVSTACK` con la sezione davanti (es. «Cani › Fattrici › Desy»). `navDecor` gira anche quando la pagina si ridisegna.
- In fondo alla scheda del cane riquadri richiudibili `DF(titolo,riassunto,contenuto)` (`details.dfold`, chiusi, memoria DOPEN):
  Test dei genitori, DNA, Pedigree (padre × madre), Consanguineità (COI SBT), Cucciolata di nascita, Fratelli, Cucciolate, Figli
  (numero), Note (inizio). `ckGo` apre il riquadro chiuso. Per i cani di casa (`home`: non esterni, senza proprietario, non
  prenotati/ceduti) la Salute sta subito dopo Dati e Calori.
- Un solo «✏️ Modifica» (`editOn`): nel riquadro di modifica anche foto (`ef_ph`, `EF_PHOTO`, «Togli foto» `efPhDel`; si salva
  solo con Salva), link SBTpedigree (`ef_sbt`), test, titoli e note. Tolto il tasto «Foto, test, titoli e note» (`dogForm` resta per
  «Nuovo cane» e gli altri usi).

## 📥 Denunce di cessione dalla mail del Comune, firmate da Paolo (20/10/2026, anteprima approvata da Paolo)
- Scheda della cucciolata → Passaggi di proprietà: sulle righe già mandate «⏳ manca la denuncia» / «✓ Registrato dal Comune»
  (`cesDoc`); tasti «📥 Prendi dalla mail del Comune» (`cesStart(lid,"mail")`) e «📎 Oppure carica il PDF» (`cesStart(lid,"file")`).
- Mail: Gmail in sola lettura dal browser (`grToken`, scope gmail.readonly, stesso client `DRIVE_CLIENT`), ricerca
  `from:(ppAddr()) has:attachment filename:pdf after:<primo ppSent − 1 giorno>`, allegati PDF (`grGet`). Il PDF del Comune è una
  scansione, una «Denuncia di cessione del cane» per pagina (esempio del 05/05/2026: Andy Hug, Ernesto Hoost, Jerome Le Banner).
- `cesRead`: ogni pagina diventa un PDF a sé (pdf-lib), Claude legge microchip, cane, acquirente, data (compito `cessione` in ai.js,
  permesso proprietari 2), miniatura con pdf.js; abbinamento dal microchip (`cesMatch`); già salvata → senza spunta.
- `cesList`: spunte, firma salvata (o `ctPad("cesSig")`, che diventa `settings.sellerSig`), casella «Sono … e firmo …» (`cesMe`).
  `cesSave` → `cesStamp` (firma nelle 2 righe «FIRMA DEL DICHIARANTE», `CES_SPOTS`, pagine /Rotate 270 provate) → documento
  `{title:"Denuncia di cessione (Comune)",ces:true,cert:true,private:false,signed}` (sostituisce una precedente): in «Certificati»,
  visibile alla famiglia (scelta di Paolo). L'originale senza firma resta nella mail.

## Scheda della cucciolata in ordine (20/10/2026, Paolo: «vedo un gran casino… mettiamo ordine?», anteprima approvata)
- `litterSheet`: intestazione (genitori, nata il, giorni, cuccioli), poi «👉 Prossima cosa da fare» (la prima voce da fare dei
  riquadri, tasto «Vai» = `lphGo`, apre e scorre al riquadro) oppure «✓ niente da fare», poi 6 riquadri `details.lph` da `litPhases(lid)`:
  🐣 Nascita e cuccioli (birthHtml, gphotosHtml, elenco) · 📄 ENCI (maBox, mbBox) · 🪪 Anagrafe (iscBox, ppLitBox: iscrizioni,
  passaggi firmati/mandati, denunce del Comune) · 👨‍👩‍👧 Famiglie (linkBox: contratti, link, recensioni) · 🌐 Sito (cuBox) ·
  🗂️ Archivio (note, link SBT, drBox). Ognuno: stato «✓ fatto» / «⏳ N da fare» / spento, righe ✓ / pallino, poi i comandi di prima.
  Aperti da soli quelli con cose da fare; aperto/chiuso ricordato (`LPH_OPEN`). Tolti qui «Cosa c'è» (ckDecorate) e l'avviso grande
  del Modello B (mbBanners resta in Oggi/Cani/Scadenze). Per aggiungere una cosa alla scheda: metterla nel riquadro giusto di `litPhases`.

## Stile più sobrio: scheda del cane (20/10/2026, Paolo: «più professionale… semplice», anteprima approvata)
- NUOVA DIREZIONE GRAFICA (sostituisce «Colori ovunque»/colorize per le pagine rifatte): icone a linea grigie (`DIC`, `dIc(k)`),
  un solo colore forte (rosso `--accent`) per tasti importanti e riga sotto il nome, stati scritti piccoli («N da fare» arancione,
  «In regola» verde) con puntini, niente emoji colorate né colori diversi per sezione. Dentro `.dph-b` i titoli colorati di
  `colorize` sono spenti dal CSS. Da applicare man mano alle altre pagine.
- `dogDetail`: intestazione a documento (`.idc`: foto o «Aggiungi foto», nome, nome di chiamata, riga sesso/stato/famiglia, riga
  rossa, griglia Nato il/Età/Mantello/Microchip/LOI/Genitori), 2–3 tasti (Modifica, Avvisa la famiglia, Come la vede…, Prova un
  accoppiamento solo per i non cuccioli), riquadro «da fare» (`.dcta`, prima voce da fare, `dphGo`), riquadri `details.dph`
  (`DPH_OPEN`, aperti da soli se c'è da fare; Dati aperto in Modifica): Dati · Famiglia e documenti (o «Documenti per la famiglia»)
  · Crescita · Calori e cucciolate / Cucciolate e figli · Salute e documenti (scadenze in ritardo da `scEvents`) · Test, esposizioni
  e titoli · Pedigree e parenti · Note. Tolto «Cosa c'è» dalla scheda del cane (`ckDecorate` saltato se c'è `.dph`).
- Pagina della famiglia (`ownerPreview`, blocco comune: vale per /p/<token> e per «Come la vede la famiglia») nello stesso stile:
  allevamento in alto, «Ciao <nome>, ecco la pagina di <cane>», intestazione a documento (`.idc`: Nato il, Mantello, Microchip,
  LOI, Genitori, Ultimo peso), poi contratto da firmare / novità / istruzioni (`ctTop`, `nvBox`, `ovImp`, invariati), poi riquadri
  chiusi `OS(...)` (`details.dph`, `DPH_OPEN` con chiave «ov<id>|…»): Documenti · Salute e promemoria (prossimo da `calEvents`) ·
  Crescita e foto · I genitori (pedigree, COI, test) · Esposizioni · I tuoi dati; in fondo «L'allevatore» (`.ov-brd`). Quanto mangia
  e «Aggiungi tu» restano sotto, aggiunti dalla pagina del proprietario come prima.
- (20/10/2026, Paolo: «il nuovo stile lo vorrei su tutte le pagine/schede») `colorize(root)` ora è il passaggio «sobrio» per tutte le
  pagine, finestre e la pagina della famiglia: niente più colori/emoji per titolo (la tabella `CZ` non si usa più); `soberText` toglie
  l'emoji iniziale da titoli, tasti con testo, etichette e stati (non dai tasti fatti solo di un'emoji, né dentro `.keep-emo`);
  riquadri della Salute (`details.hs`) bianchi con icone a linea (`HS_IC`: syr, pill, flask, bug, shield); riquadri della cucciolata
  con icone `dIc` e stati scritti senza pillole; riquadro Novità neutro con bordo blu a sinistra. Nuove pagine: usare `dIc`, niente emoji.
- (20/10/2026, Paolo) Riquadri `details.dph` (scheda del cane) e `details.lph` (Scheda della cucciolata) sempre CHIUSI di base (si apre
  solo quello che Paolo apre, ricordato nella sessione; Dati si apre in Modifica). Se il riquadro ha qualcosa da sistemare: classe
  `need` = richiamo arancione (bordo a sinistra, fondo e titolo arancioni, «N da fare»).
- (20/10/2026, Paolo: «chiusi… voglio ordine, non casino») Gruppi per cucciolata di Proprietari e di Cani › Ceduti = `details.grp` chiusi
  (aperto/chiuso ricordato da DOPEN). Richiamo arancione `need` + «N da sistemare»: Proprietari = contratto non firmato o link non
  mandato; Ceduti = passaggio non firmato o mandato senza denuncia del Comune.

## Tutte le sezioni in ordine (20/10/2026, Paolo: «tutto in ordine Vergine», anteprima approvata)
- Aiuti comuni (blocco comune, dopo `DPH_OPEN`): `PGH(titolo,sotto,tasti)` intestazione con riga rossa; `PCTA(t,s,tasto,rosso)` UN solo
  avviso in cima; `PSEC(chiave,icona,titolo,riassunto,n,contenuto,ok,aperto)` riquadro chiuso (`details.dph`, ricordato in DPH_OPEN
  con "pg|<chiave>"), arancione con «N da fare» se n>0, «In regola» se ok===true, testo grigio se ok è una stringa; `PROW(stato,testo,
  valore,tasto)` riga con pallino; `noEmo` toglie l'emoji iniziale. Nuove pagine: usare questi.
- Fondo dei riquadri «da fare» BIANCO (Paolo: niente rosa): solo striscia, titolo e «N da fare» arancioni (dph, lph, grp).
- Fatte: ☀️ Oggi (`ogPage`: avviso più urgente = temperatura, poi scadenze in ritardo, poi appuntamento di oggi; sito; 7 riquadri),
  Agenda (`agPage`: Da fissare, In programma, Visite fatte, Già ritirati, «Leggi un messaggio di WhatsApp» in fondo), Scadenze
  (`scPage`: Scadute in arancione + gruppi chiusi, campanello a linea; niente più `mbBanners` qui), Conti (`acList`: tre numeri,
  avviso cuccioli senza prezzo, una riga chiusa per cucciolata e Spese generali).
- (20/10/2026, secondo giro) Cucciolate (`litterList`: un gruppo chiuso per «In programma» e per anno, «N da fare» da `litPhases`, avviso
  della prima cucciolata con cose da fare), Attesa (`waitList`: avviso richieste nuove, Interessati, una riga chiusa per cucciolata con
  ordine di scelta, «Hanno rinunciato» a parte), Anagrafe (`anagPage`: Da sistemare / Iscritti / Stato non segnato), Account
  (`acPage` = `acPageRaw` + ogni `section.ac-c` diventa un riquadro chiuso; arancione se c'è un `ac-st ko`; `acOpenSec`), Cani
  (intestazione PGH al posto di `hero()`, un solo avviso `caniTop()`: Modello B entro 30 giorni, se no appuntamento di oggi; tolti
  agBanner e mbBanners dall'elenco), Accoppiamenti (fila di bottoni divisa in riquadri Consanguineità / Test genetici / Altri maschi,
  con ✓), Statistiche (`foldMain`: ogni titolo h2 diventa un riquadro chiuso). Tutte le pagine: `#main>h1` con la riga rossa.
- In proprietario.html `mating()` è una versione più vecchia (non usata nella pagina della famiglia): lì l'Accoppiamenti non è cambiato.
- (20/10/2026, terzo giro) Accoppiamenti, risultato della coppia (`calcMate`): Regole ENCI, «Su chi cade la consanguineità» e Test
  genetici della coppia in riquadri chiusi (Regole ENCI arancione se una regola non è rispettata o è da controllare); righe ENCI con
  pallini al posto dei cerchi colorati; `colorize` anche qui. Traduci: titoli numerati 1-2-3 (`.tr-st`). Quanto mangia: «Crocchette
  aggiunte dagli utenti» è un riquadro chiuso (prima si apriva da solo). Google: solo titolo e sezioni sobrie (colorize).
- (20/10/2026) Cani › Tutti e Cani › Esterni (`tuttiGroups`, anteprima approvata): gruppi chiusi I miei cani (arancione se un cane ha scadenze in
  ritardo) · Prenotati · Ceduti (dentro per cucciolata, `litterGroups`) · Padri e madri esterni (usati in `D.litters`) · Antenati del
  pedigree divisi per lettera (A–C, D–G, H–M, N–R, S–Z, titoli come «Ch.» ignorati) · Non più con noi.
- REGOLA di Paolo (20/10/2026): «tutto ciò che è lungo da scorrere lo voglio riordinato con tendina». Ogni elenco che può superare
  ~10 voci va diviso in gruppi chiusi (`PSEC`): per anno (`yearFold(chiave,[[data,html,daFare,aperto]],icona,nome)`), per tipo o per
  cucciolata (`litterGroups`). Fatti: Cani › Tutti/Esterni (`tuttiGroups`), Cani › Miei con più di 10 cani (Fattrici, Stalloni,
  Sterilizzati, Non più con noi, A casa), Cani › Prenotati con più di 8 (per cucciolata), Google › Recensioni › Tutte (per anno,
  arancione l'anno con recensioni nuove senza risposta), Google › Post pubblicati (per anno).
- (20/10/2026, Paolo: «ho dovuto scorrere troppo») «Modifica» del cane (`dogFacts` con EDIT) a riquadri chiusi (`EG`, `details.ef-g`,
  DPH_OPEN "ef|<id>|<parte>"): Nome, sesso e nascita · Stato e proprietario · Colore, LOI e microchip · Genitori e COI · Foto, test,
  titoli e note · Elimina questo cane; Salva/Annulla sia in cima sia in fondo. I campi chiusi restano nella pagina: Salva li legge tutti.
  Freccia dei riquadri: ruota solo quella del riquadro aperto (`.dph[open]>summary .dph-chev`).
- (20/10/2026, Paolo: «testo fuori schermata») Righe degli elenchi (`.list .row`): `min-width:0`, `max-width:100%`, `box-sizing:border-box`,
  nomi che vanno a capo: prima i nomi lunghi dei genitori allargavano la riga e le etichette Ceduto/Firmato uscivano a destra.
- (20/10/2026, Paolo: «controlla tutto per la visuale da mobile… tutte le schede e finestre») Controllo automatico a 320, 360, 375, 390 e
  414 px di tutte le voci del menu, tutti i filtri di Cani, schede dei cani (fattrice, cucciolo, esterno), Modifica, proprietario, Conti
  della cucciolata, Scheda della cucciolata, pagina della famiglia (vera, /p/<token>) e 40 finestre: niente più testi o tasti fuori
  schermo o tagliati. Sistemati: tasti dell'Anagrafe, voci della Consegna (Visualizza/Stampa), righe della Salute/iscrizioni (`.hrow`),
  tabella della nascita (`.nb`, sul telefono si stringe), righe di Account (`.acx-r`, `.ac-st` va a capo), tasti dei Modelli A/B
  (`.enc-btns`), righe dei Passaggi di proprietà (`.pp-r`). Regola: righe con flex/grid → `min-width:0` sui figli e a capo.
- (20/10/2026, Paolo: «troppo pacchiano… il menu di sx lo trovo infantile», anteprima approvata: scelta B, menu chiaro) Menu a sinistra
  del computer a gruppi (`nav()`, `NG`): Il giorno (Oggi, Agenda, Scadenze) · Allevamento (Cani, Cucciolate, Accoppiamenti, Anagrafe,
  Quanto mangia) · Famiglie (Proprietari, Attesa, Traduci) · Sito e numeri (Google, Statistiche, Conti) · Impostazioni (Account); nome
  del gruppo in piccolo (`.ngr`), quadratino di colore spento con icona bianca, un colore per gruppo (`.nsq`), voce aperta sottolineata in
  rosso. Voci nuove: metterle in un gruppo di `NG` (altrimenti finiscono in «Altro»). La barra in basso del telefono non cambia.
  La fascia beige del salvataggio (`bannerHtml`) è ora una riga sottile (`.banner.sbar`): puntino verde «Salvato alle …» (arancione con
  l'errore), «Copia di sicurezza» e «Importa modifiche» come collegamenti. Gli avvisi veri (database vuoto, conflitto, solo da guardare)
  restano come prima.
- (20/10/2026, anteprima approvata) Agenda: «Leggi un messaggio di WhatsApp» è un riquadro chiuso in fondo (`PSEC("ag-wa")`); si apre da
  solo se c'è già un testo (comando rapido `#agenda=`), Claude sta leggendo o c'è il risultato. Casella del messaggio larga quanto il riquadro.
- (20/10/2026, anteprima approvata) Scheda del proprietario (`ownerDetail`): intestazione PGH con Modifica e Messaggio tradotto, un solo
  avviso (contratti da firmare/preparare, link da mandare, documento d'identità mancante; verde se è tutto a posto), riquadri chiusi
  Contatti · Cani · Documenti d'identità · Pagina della famiglia (`ownLink`) · Note. «Cosa c'è» non c'è più (c'è `.dph`).
  Cani › Miei sempre a gruppi chiusi (anche pochi cani), arancione il gruppo con scadenze in ritardo.

## Documenti della cucciolata (20/10/2026, scelta A di Paolo)
- Scheda della cucciolata → Archivio → «Documenti della cucciolata» (`ldHtml`): `l.docs=[{id,title,date,file,fname}]`, Visualizza/
  Scarica, ✕ (`ldDel`), «＋ Aggiungi documento (PDF o foto)» (input `.ldIn`, chiede titolo e data). Solo per Paolo: `LIT_PRIV`
  (pagina della famiglia), `viewerData` e `limitedData` senza Proprietari tolgono `docs`; `mergeLimited` rimette quelli veri
  (anche mbFile/modA/modB, prima si perdevano se chi modificava le cucciolate non vedeva i Proprietari).
- "Importa modifiche" con `{documentiCucciolata:[{dam,sire,date,docs:[{title,date,fname,file}]}]}` (`importLitDocs`): cucciolata
  dai nomi dei genitori (e dalla data se ce n'è più di una), senza doppioni (fname). Primo: certificato di inoculazione dei
  microchip della cucciolata Billy × Black Jack (18/08/2026).
- "Importa modifiche" con `{controlloCuccioli:{dam,sire,date,pups:[{name,sex,chip,color,color_en}]}}` (`importCheck`, `ccShow`,
  `ccFill`): confronta un documento (es. certificato dei microchip) con le schede dei cuccioli della cucciolata (microchip, poi nome
  o soprannome): ✓ uguale, ＋ manca, ≠ diverso. «Completa i N dati mancanti» scrive SOLO i campi vuoti; le differenze non si cambiano.

## Stile app (20/10/2026, Paolo: «non ci metti fantasia», scelto il n. 1 Breedera, anteprima approvata «può andare»)
- Blocco CSS «STILE APP» in fondo al primo `<style>` dei due file (uguale): carattere Plus Jakarta Sans (anche `--serif`, i titoli
  non sono più «da libro»), sfondo #F1F3F4, riquadri tondi (`--rr` 20px) con ombra (`--sh`) e senza bordo, niente riga rossa sotto i
  titoli, menu a sinistra con icone a linea (voce aperta bianca con ombra, testo rosso), barra in basso del telefono a pillola sospesa.
  Niente rosa: `.badge.f` (Fattrice/Stallone) azzurro-grigio.
- Foto automatiche (scelta di Paolo): `dogPic(d)` = cuccioli sotto l'anno l'ultima «Foto della crescita», altrimenti la foto della
  scheda (o l'ultima della crescita); `litPic(lid)` = ultima foto di gruppo, se no l'ultima dei cuccioli, se no la madre.
- Cani: `cards(ids)` = schede con foto quadrata, ♂/♀, «N da fare» (scadenze in ritardo), nome, nome di chiamata, stato, età,
  famiglia; senza foto l'iniziale e «+ Foto» (`qPh`). Miei = titoli aperti per gruppo (Fattrici, Stalloni…) con le schede;
  Prenotati, Ceduti e i gruppi per cucciolata (`litterGroups`) chiusi come prima ma con le schede dentro; Esterni e antenati restano a righe.
- Scheda del cane e pagina della famiglia: con la foto, intestazione `idHero` (foto grande, nome ed etichette sopra, «Cambia foto»,
  tocco = visore `img[data-lb]` → `lbShow`); senza foto come prima.
- Oggi: `ogLitHero()` (cucciolata nata da ≤180 giorni: foto, giorni, genitori, famiglie, barra delle tappe da `litPhases`, prossima
  cosa da fare, «Apri la cucciolata») e in fondo `ogDogs()` (i cani di casa in fila da scorrere). Scheda della cucciolata: foto di
  gruppo in cima (`.ls-ph`).
