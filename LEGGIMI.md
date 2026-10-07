# PRIMA DI PUBBLICARE UNO ZIP (da leggere sempre)

Dal 07/10/2026 ogni pubblicazione si fa così, sempre uguale:
```
cd C:\Hugo\gestionale-allevamento
git pull
Expand-Archive -Path "$env:USERPROFILE\Downloads\NOME-DELLO-ZIP.zip" -DestinationPath "C:\Hugo\gestionale-allevamento" -Force
python tools/controlla.py
```
- Se l'ultima riga dice **TUTTO A POSTO** → `git add .` → `git commit -m "..."` → `git push`.
- Se dice **ATTENZIONE** → NON fare il push. Copia il testo e mandalo a Claude. Per annullare l'estrazione dello zip:
  `git checkout -- .` (rimette i file come sono su GitHub).

Regole d'oro:
- Pubblica solo lo zip **più recente** della conversazione in cui stai lavorando. Mai zip vecchi o di altre conversazioni.
- In una conversazione nuova sul gestionale, scrivi a Claude per prima cosa:
  «Parti dal repository su GitHub: https://github.com/zonerosse/gestionale-allevamento»

**Se una sezione sparisce dopo un push:** non toccare niente e scrivilo a Claude. Si recupera sempre: GitHub conserva tutte
le versioni, e i dati (cani, agenda, proprietari…) stanno nel database, non nel codice.

---

# Gestionale Del Piccolo Diavolo – versione online

Indirizzo previsto: **https://gestionale.delpiccolodiavolo.it**
Tutto su Cloudflare: Pages (pagine), D1 (dati), R2 (foto e PDF), Access (accesso riservato).

- `/` → il gestionale, solo per te (codice via email con Cloudflare Access).
- `/p/<link segreto>` → la pagina privata di un proprietario: vede solo i suoi cani.

Il file **dati-iniziali-gestionale.json** NON va su GitHub: contiene i dati dei proprietari.
Serve una volta sola, al primo avvio (passo 7). Poi conservalo in un posto sicuro.

---

## 1. Repository su GitHub
1. Su GitHub crea il repository **privato** `zonerosse/gestionale-allevamento` (vuoto).
2. Estrai lo zip in `C:\gestionale-allevamento` e da PowerShell:
   ```
   cd C:\gestionale-allevamento
   git init
   git add .
   git commit -m "Gestionale online, prima versione"
   git branch -M main
   git remote add origin https://github.com/zonerosse/gestionale-allevamento.git
   git push -u origin main
   ```

## 2. Database (D1)
1. Cloudflare → **Storage & databases → D1** → *Create* → nome `gestionale-allevamento`.
2. Apri il database → **Console** → incolla il contenuto di `schema.sql` → *Execute*.

## 3. Archivio file (R2)
1. Cloudflare → **R2** → *Create bucket* → nome `gestionale-allevamento-file`.
   (R2 è gratuito fino a 10 GB; Cloudflare può chiedere un metodo di pagamento per attivarlo.)

## 4. Progetto Pages
1. **Workers & Pages → Create → Pages → Connect to Git** → `gestionale-allevamento`.
2. Impostazioni di build: Framework *None*, comando di build **vuoto**, cartella di output **`public`**.
3. Dopo il primo deploy: **Settings → Bindings → Add**:
   - *D1 database*: nome variabile **`DB`** → `gestionale-allevamento`
   - *R2 bucket*: nome variabile **`FILES`** → `gestionale-allevamento-file`
4. **Custom domains** → aggiungi `gestionale.delpiccolodiavolo.it`.

## 5. Accesso riservato (Cloudflare Access)
Cloudflare → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
Crea **tre** applicazioni:

| Nome | Dominio | Percorso | Policy |
|---|---|---|---|
| Gestionale | gestionale.delpiccolodiavolo.it | *(vuoto)* | **Allow** – Include: *Emails* → la tua email |
| Pagine proprietari | gestionale.delpiccolodiavolo.it | `p` | **Bypass** – Include: *Everyone* |
| Dati proprietari | gestionale.delpiccolodiavolo.it | `api/public` | **Bypass** – Include: *Everyone* |

Metodo di login: *One-time PIN* (codice via email).

## 6. Le due variabili per la sicurezza
1. Apri l'applicazione **Gestionale** in Access → copia **Application Audience (AUD) Tag**.
2. Zero Trust → **Settings → Custom Pages** (o *Team domain*): copia il dominio del team, tipo `https://NOME.cloudflareaccess.com`.
3. Pages → **Settings → Variables and secrets** → aggiungi:
   - `POLICY_AUD` = il tag AUD
   - `TEAM_DOMAIN` = `https://NOME.cloudflareaccess.com`
4. **Deployments → Retry deployment** (le variabili valgono dal deploy successivo).

Senza queste due variabili il gestionale non mostra i dati: è voluto.

## 7. Primo avvio
1. Apri https://gestionale.delpiccolodiavolo.it → ricevi il codice via email → entri.
2. Il riquadro arancione dice che il database è vuoto → **Scegli il file dei dati iniziali** → `dati-iniziali-gestionale.json`.
3. Aspetta che finisca il caricamento (circa 160 foto e PDF).
4. Le modifiche fatte nel file sul PC (sverminazioni, proprietari, ecc.): apri il vecchio file, premi **Esporta dati**, poi online **Importa modifiche** e scegli il file esportato.

## Uso quotidiano
- Si salva da solo, pochi secondi dopo ogni modifica. Ogni salvataggio resta anche nello storico (ultimi 200).
- **Copia di sicurezza**: scarica tutto in un file; fallo ogni tanto.
- **Link del proprietario**: scheda del proprietario (o “Come la vede il proprietario”) → *Crea il link privato* / *Copia link* → lo mandi su WhatsApp.
  *Cambia link* invalida quello vecchio.
- Il proprietario non vede: note, altri cani, altri proprietari, documenti segnati “Solo per me”.
