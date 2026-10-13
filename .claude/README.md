# Nástroje pre Claude Code

V tomto priečinku sú pomôcky, ktoré Claude Code v repe KD 1035 používa. Sú dvoch druhov:

- **Skill** (`.claude/skills/<meno>/SKILL.md`) – postup krok za krokom pre jeden typ úlohy. Claude ho načíta a pracuje podľa neho v tej istej konverzácii.
- **Agent** (`.claude/agents/<meno>.md`) – samostatný pomocník s vlastným kontextom. Claude mu zadá úlohu a dostane späť iba výsledok, takže hlavná konverzácia sa nezahltí logmi.

Všetky majú prefix `kd-`, inštrukcie sú po anglicky (sú pre Clauda), s Getherom komunikujú po slovensky. Pravidlá projektu sú stále v [CLAUDE.md](../CLAUDE.md) – nástroje ich nenahrádzajú, iba podľa nich postupujú.

## Ako ich spustiť

| Chceš… | Napíš |
|---|---|
| spustiť skill priamo | `/kd-fix-bug v CZ kalendári je čas o hodinu posunutý` |
| nechať Clauda vybrať | stačí popísať úlohu („oprav…“, „pridaj pole do modelu…“) – skill sa vyberie podľa svojho popisu |
| použiť agenta | „spusti kd-smoke-test: over, že `/api/events/` vráti nový event“ |

Nové alebo zmenené súbory Claude Code zvyčajne načíta sám. Ak skill v `/` ponuke nevidíš, napíš `/reload-skills` alebo Claude Code reštartuj.

## Prehľad

### Skilly

| Skill | Kedy | Čo urobí |
|---|---|---|
| `kd-plan-feature` | chceš niečo nové, väčšie ako jeden súbor | doplňujúce otázky, krátky plán s akceptačnými kritériami, pri väčšej veci ho dá posúdiť `kd-critic`. Kód nepíše. |
| `kd-fix-bug` | niečo je pokazené | najprv chybu zreprodukuje v padajúcom teste, príčinu napíše jednou vetou, potom najmenšia oprava a PATCH verzia |
| `kd-migration` | mení sa model alebo treba prerobiť dáta | vygeneruje migráciu, prečíta operácie aj SQL, odchytí premenovanie, ktoré Django spravilo ako zmazanie + pridanie, otestuje |
| `kd-write-tests` | ideš meniť kód, ktorý má málo testov | vypíše správanie (oprávnenia, validácia, časové hranice, SK/CZ, zlyhanie API…) a pokryje ho test po teste |
| `kd-done` | posledný krok pred commitom a pushom | jeden checklist: testy, žiadne tajomstvá v diffe, dopad na živý web, migrácie, screenshoty, SK + CZ, Ochrana údajov, `.env.example`, verzia |
| `kd-doc-budget` | ideš rozširovať `CLAUDE.md` alebo `docs/*.md` | limity veľkosti a ako súbor zmenšiť bez straty informácií |
| `kd-qa` | pred mergom do `main` (= nasadenie), po zmene UI, „na mobile to je divné“ | automatické e2e testy (`tools/e2e`), potom paralelní `kd-qa-tester` v skutočnom Chrome cez Chrome DevTools MCP; jeden zoradený report so screenshotmi. Detail `docs/qa.md` |
| `kd-docs-drift` | raz za čas, po veľkej zmene | porovná dokumentáciu s kódom (cesty, príkazy, premenné, čísla) a stránky Ochrana údajov / Podmienky s tým, čo kód naozaj ukladá. Opravuje až po tvojom súhlase. |

Pôvodné skilly ostávajú: `kd-verify` (testy + screenshoty), `kd-release` (nová verzia), `kd-event-data` (zmena eventov), `kd-review-branch` (vetva spolupracovníka); k nim workflow `kd-meta-update` (mesačná aktualizácia návodov, `.claude/workflows/`). Nové skilly ich volajú, nenahrádzajú.

### Agenti

| Agent | Kedy | Čo vráti |
|---|---|---|
| `kd-smoke-test` | zmenu treba vyskúšať naozaj – API ako anonym / test hráč / superuser, prehliadač, log workera | verdikt `PASS` / `FAIL` / `PARTIAL` / `BLOCKED` s dôkazmi. Iba čítanie, dev stack. |
| `kd-qa-tester` | manuálne / exploratívne testovanie v Chrome (MCP `chrome-devtools`) – emulácia mobilov, pomalá sieť, konzola, Lighthouse | nálezy Blokujúce / Vážne / Drobné / Nápad s repro krokmi a screenshotmi v `tools/qa/out/`. Iba čítanie. |
| `kd-docs-lookup` | potrebuješ presné API Django 6, DRF, Angularu, Vitestu, Playwrightu, nh3, Compose, nginx alebo Discordu | krátku odpoveď so zdrojom a verziou. Nič neupravuje. |

Pôvodní agenti `kd-ideator`, `kd-critic`, `kd-builder` patria ku kolám `kd-improve` (`docs/agenti.md`), ktoré sa spúšťajú už len na Getherov pokyn. `kd-critic` a `kd-builder` sa dajú použiť aj samostatne – `kd-plan-feature` a `kd-done` ich volajú.

## Typické postupy

```text
Nová funkcia   kd-plan-feature  →  stavba (sám alebo kd-builder)  →  kd-done
Chyba          kd-fix-bug  →  kd-done
Zmena modelu   kd-migration  (kd-done ju pripomenie)
Pred refaktorom   kd-write-tests
Treba to vidieť bežať   kd-smoke-test
Pred mergom / mobil     kd-qa  (tools/e2e + kd-qa-tester v Chrome)
Dokumentácia   kd-doc-budget pri písaní, kd-docs-drift raz za čas
```

`kd-done` sám odkáže na `kd-verify`, `kd-migration`, `kd-release` a `kd-critic`, keď sa ich to týka.

## Čo nástroje nikdy nerobia

- **Nič na serveri.** Žiadne prihlásenie, príkazy ani zápis do produkcie. Nasadenie (`git pull && docker compose up -d --build`) robí Gether ručne.
- **kd1035.eu iba na výslovnú žiadosť.** Jediný, kto tam smie, je `kd-smoke-test` – a len keď to v zadaní povieš, iba pár GET/HEAD požiadaviek (hlavičky, presmerovanie `www`, 404, sitemap, `.ics`, náhľady odkazov). Bez prihlásenia, formulárov a adminu.
- **Migrácie berú ako nasadené.** Čo je na `main`, sa nikdy neupravuje spätne. Zmazanie stĺpca či dát len s tvojím výslovným „áno“ a so zálohou na serveri pred nasadením.
- **Tajomstvá do gitu.** Repo je verejné – `kd-done` pred každým pushom kontroluje, či v diffe nie je nič z `.env`, token, webhook ani dáta hráčov.
- **Testovacie dáta v dev databáze.** Dev DB ide cez pre-commit hook do gitu, preto jediný povolený test hráč je ten z `manage.py test_session` a po skúške sa vždy zmaže.

## Voliteľné doplnky

Fungujú aj bez nich:

- **superpowers plugin** – ak je nainštalovaný, `kd-fix-bug`, `kd-write-tests` a `kd-plan-feature` použijú jeho skilly na debugovanie, TDD, brainstorming a plánovanie.
- **Context7 MCP** – ak je pripojený, `kd-docs-lookup` číta dokumentáciu cez neho, inak ju stiahne z oficiálnych stránok.

## Pridať alebo upraviť nástroj

1. Skill: `.claude/skills/kd-<meno>/SKILL.md`, agent: `.claude/agents/kd-<meno>.md`. Hlavička (frontmatter) musí mať `name` a `description` – podľa `description` Claude spozná, kedy nástroj použiť, preto v nej napíš **kedy** ho použiť.
2. Inštrukcie po anglicky, krátko (skill `kd-doc-budget`: do ~200 riadkov / 4k tokenov). Na pravidlá odkazuj (`CLAUDE.md → Dáta a zálohy`), nekopíruj ich.
3. Agent, ktorý nemá meniť súbory, dostane `tools:` (zoznam povolených) alebo `disallowedTools: Edit, Write, NotebookEdit`.
4. Zapíš ho do zoznamu v `CLAUDE.md` (Automatizácia agentmi) a do tabuľky vyššie.
5. Nástroje, dokumentácia a testy verziu webu nemenia (`CLAUDE.md → Verzia webu`).
