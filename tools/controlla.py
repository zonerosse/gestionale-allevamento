"""Controllo prima di pubblicare il gestionale (07/10/2026).

Confronta i file che stai per pubblicare con l'ultima versione su GitHub e avvisa se qualcosa SPARISCE:
funzioni del codice, voci del menu, file del server. Serve a evitare che uno zip preparato su una copia
vecchia cancelli il lavoro fatto dopo (è successo il 07/10/2026).

Uso, dalla cartella del gestionale, DOPO aver estratto lo zip e PRIMA di git push:
    python tools/controlla.py
Se scrive "TUTTO A POSTO" puoi fare git push. Se scrive "ATTENZIONE", non pubblicare e manda il testo a Claude.
"""
import re, subprocess, sys, os

def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True, encoding="utf-8", errors="replace")

git("fetch", "-q")
problemi = []
for f in ["public/index.html", "public/proprietario.html"]:
    r = git("show", "origin/main:" + f)
    if r.returncode != 0 or not os.path.exists(f):
        continue
    prima, ora = r.stdout, open(f, encoding="utf-8", errors="replace").read()
    fn = lambda s: set(re.findall(r"function (\w+)\(", s))
    via = sorted(fn(prima) - fn(ora))
    if via:
        problemi.append(f"{f}: spariscono {len(via)} funzioni: " + ", ".join(via[:25]) + (" …" if len(via) > 25 else ""))
    tabs = lambda s: set(re.findall(r'\[\s*"(\w+)","[^"]+",\'<', s))
    vt = sorted(tabs(prima) - tabs(ora))
    if vt:
        problemi.append(f"{f}: spariscono voci del menu: " + ", ".join(vt))
    if len(ora) < len(prima) * 0.9:
        problemi.append(f"{f}: il file è molto più corto di quello su GitHub ({len(ora)} contro {len(prima)} caratteri)")
r = git("ls-tree", "-r", "--name-only", "origin/main", "functions")
for f in r.stdout.split():
    if not os.path.exists(f):
        problemi.append(f"manca il file del server {f}")

if problemi:
    print("ATTENZIONE: questa versione cancella cose che su GitHub ci sono. NON fare git push.")
    for p in problemi:
        print(" - " + p)
    print("Manda questo testo a Claude.")
    sys.exit(1)
print("TUTTO A POSTO: niente sparisce rispetto a GitHub. Puoi fare git push.")
