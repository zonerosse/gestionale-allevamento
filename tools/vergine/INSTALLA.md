# Gestionale allevamento – installazione da zero

Il gestionale è un programma per l'allevamento: cani, pedigree e consanguineità (COI), cucciolate, proprietari,
salute e scadenze, agenda dei ritiri e delle visite, lista d'attesa, conti, anagrafe canina, Modelli A e B ENCI,
pagina privata per ogni famiglia.

Gira tutto sul tuo account **Cloudflare** (gratuito per un allevamento): le pagine, il database, le foto e i PDF,
l'accesso con codice via email. **I dati sono solo tuoi**: stanno nel tuo Cloudflare, non nel programma.

Tempo: circa un'ora la prima volta. Ti servono un account **GitHub** e un account **Cloudflare** (tutti e due gratuiti).

---

## 1. Il programma su GitHub
1. Su GitHub crea un repository **privato**, per esempio `gestionale-allevamento`.
2. Carica dentro tutti i file di questa cartella (anche le sottocartelle `public`, `functions`, `tools`).
   Il modo più semplice: GitHub Desktop → *Add existing repository* → questa cartella → *Publish repository* (spunta "Keep this code private").

## 2. Il database (D1)
1. Cloudflare → **Storage & databases → D1** → *Create* → nome `gestionale-allevamento`.
2. Apri il database → **Console** → incolla il contenuto del file `schema.sql` → *Execute*.

## 3. L'archivio di foto e PDF (R2)
1. Cloudflare → **R2** → *Create bucket* → nome `gestionale-allevamento-file`.
   (Gratuito fino a 10 GB; Cloudflare può chiedere un metodo di pagamento per attivarlo.)

## 4. Il sito del gestionale (Pages)
1. **Workers & Pages → Create → Pages → Connect to Git** → scegli il repository del punto 1.
2. Impostazioni: Framework *None*, comando di build **vuoto**, cartella di output **`public`**.
3. Dopo la prima pubblicazione: **Settings → Bindings → Add**
   - *D1 database*: nome **`DB`** → `gestionale-allevamento`
   - *R2 bucket*: nome **`FILES`** → `gestionale-allevamento-file`
4. Indirizzo: va bene quello che dà Cloudflare (`….pages.dev`). Se hai un dominio tuo, **Custom domains** → per esempio `gestionale.tuosito.it`.

## 5. L'accesso riservato (Cloudflare Access)
Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**. Crea **tre** applicazioni
sull'indirizzo del gestionale:

| Nome | Percorso | Regola |
|---|---|---|
| Gestionale | *(vuoto)* | **Allow** – Include: *Emails* → **la tua email** |
| Pagine delle famiglie | `p` | **Bypass** – Include: *Everyone* |
| Dati delle famiglie | `api/public` | **Bypass** – Include: *Everyone* |

Metodo di accesso: *One-time PIN* (codice via email).

Poi:
1. Apri l'applicazione **Gestionale** → copia **Application Audience (AUD) Tag**.
2. Zero Trust → **Settings** → copia il dominio del team (tipo `https://NOME.cloudflareaccess.com`).
3. Pages → **Settings → Variables and secrets** → aggiungi `POLICY_AUD` (il tag) e `TEAM_DOMAIN` (il dominio).
4. **Deployments → Retry deployment**.

Senza queste due variabili il gestionale non mostra niente: è voluto.

## 6. Primo avvio
1. Apri l'indirizzo del gestionale → arriva il codice via email → entri.
2. In alto: **«Il database online è ancora vuoto»** → **✨ Inizia da zero**.
3. Si apre **☀️ Oggi** con il riquadro **👋 Benvenuto** e cinque passi:
   1. **Dati dell'allevamento** (⚙️ Account → Allevamento): nome, titolare, indirizzo, telefono, email, sito, razza.
      Finiscono da soli in moduli, ricevute, messaggi e pagine delle famiglie.
   2. **Intestatari e firma**: codice fiscale e nascita del titolare. La firma si salva la prima volta che firmi.
   3. **Enti e destinatari**: email e WhatsApp della tua delegazione ENCI, email dell'anagrafe canina del tuo Comune.
   4. **Il primo cane**.
   5. **Collegamenti** (facoltativi, vedi sotto).
   Il riquadro sparisce quando i dati dell'allevamento ci sono e c'è almeno un cane.

## 7. Collegamenti facoltativi
Si mettono in Pages → **Settings → Variables and secrets** (poi *Retry deployment*). ⚙️ Account → Collegamenti mostra
cosa c'è e cosa manca (le chiavi non si vedono mai).

| A cosa serve | Variabili |
|---|---|
| Claude: traduzioni, letture di referti e test mating, testi | `ANTHROPIC_API_KEY` (a pagamento, console.anthropic.com) |
| Google: statistiche del sito, recensioni e post del profilo | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Salva in Drive | l'ID client si scrive in ⚙️ Account → Collegamenti → «✏️ ID client» |
| Pubblica sul sito (se il tuo sito è fatto con Hugo su GitHub) | `GITHUB_TOKEN`, `SITE_REPO` (es. `utente/sito`) |
| Posizioni su Google Maps | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` (a pagamento) |
| Contatore dei tasti WhatsApp del sito | `WA_KEY` |

## 8. Altre persone (collaboratori)
⚙️ Account → **Chi entra** → ✏️ Modifica: per ogni persona scegli, sezione per sezione, **No / Vede / Modifica**.
Dopo il primo «Salva» decide l'elenco del gestionale. Per far entrare una persona nuova, in Cloudflare Access
(applicazione **Gestionale**) aggiungi anche la sua email.

## Da sapere
- **Contratto di cessione**: non c'è. Ogni allevatore usa il suo; nel gestionale si potrà aggiungere più avanti.
- **Passaggio di proprietà**: il modulo incluso è quello della Regione Emilia-Romagna.
- **Modelli A e B**: moduli ENCI originali, compilati dal gestionale.
- **Razza**: il gestionale vale per tutte le razze. Per lo Staffordshire Bull Terrier c'è un pacchetto pronto (⚙️ Account →
  🐾 Razza → Installa): SBTpedigree, test mating SBT, test genetici della razza, istruzioni per il cucciolo, voci della Consegna,
  scadenze suggerite. Si sceglie voce per voce e si può togliere quando si vuole.
- **Copie di sicurezza**: una al giorno, automatica, per 90 giorni (⚙️ Account → Copie di sicurezza). Ogni tanto
  scaricane una anche sul computer.
