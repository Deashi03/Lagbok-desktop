# Enkelriktad synkronisering: Lagbok → Lagbok Desktop

**Lagbok (`Deashi03/Lagbok`) är den enda källan för gemensamma funktioner och juridisk data.** Lagbok Desktop (`Deashi03/Lagbok-desktop`) har en egen Windows-produkt med egna versioner och funktioner. Synkroniseringen skriver **aldrig** till Lagbok.

## Automatisk körning

`.github/workflows/sync-lagbok.yml` kontrollerar Lagboks `main` var fjärde timme och kan även köras manuellt via **Actions → Spegla Lagbok till Desktop → Run workflow**. Om Lagbok inte har ändrats sker ingen kodändring. Den exakta uppströmsversionen sparas i `.lagbok-upstream.json`.

När Lagbok ändrats:

1. Workflow hämtar både senaste `main` och den tidigare synkroniserade committen i Lagbok.
2. `scripts/sync_from_lagbok.py` tar fram bara förändrade gemensamma filer och gör en trevägsmerge mot den senast synkroniserade versionen. Desktop-egna ändringar och versioner bevaras.
3. `assets/lagboken.js` byggs om med `assets/desktop.js` sist; nyintroducerade gemensamma moduler i bundlern förs också över.
4. Kodtester, datakontroller, indexkontroll och Chromium-test måste lyckas. Om någon kontroll misslyckas ändras inte Desktop `main`. Ett GitHub-ärende öppnas utan dubbletter.
5. Om allt lyckas pushas endast Desktop-repot. När appkod eller juridisk data ändrats startas Windows-release via `workflow_dispatch`, så automatiska uppdateringar fungerar trots att `GITHUB_TOKEN`-push normalt inte aktiverar andra workflows.

## Vad delas och vad hålls separat?

Synkroniseras: gemensamma filer i `assets/`, `data/`, `scripts/`, `tests/`, samt `index.html` och `icon.svg`. Ändringar i `scripts/bundle.js` förs över i dess lista över gemensamma moduler, men `desktop.js` förblir alltid sist. `assets/app.js`, `assets/app.css`, `assets/tutorial.js` och `index.html` trevägsmergas när båda apparna har egna ändringar.

**Enbart Desktop:** `src-tauri/`, `assets/desktop.js`, `scripts/stage.js`, `scripts/sync_from_lagbok.py`, `tests/test_upstream_sync.py`, desktop-specifika workflow-filer, paketering, egna installationsversioner och anpassningarna i gemensamma filer. `assets/lagboken.js` genereras av Desktop-bundlern, kopieras aldrig från mobilen. Mobilens service worker, PWA-manifest, skärmbilder och iPhone-filer förs inte över. Desktop behåller sina egna webbläsartester (`tests/browser/`).

När Desktop får en helt ny funktion: lägg så mycket som möjligt i `assets/desktop.js`, i separata Desktop-filer eller i `src-tauri/`. Om en gemensam fil ändå behöver ändras bevaras de Desktop-specifika ändringarna via trevägsmerge. Om samma kodrad ändras i båda produkterna **blockeras synkroniseringen** för manuell samordning, i stället för att Windows-funktionen skrivs över.

## Lagdata

Desktop ska inte självständigt importera nya lagar schemalagt. Den gamla `.github/workflows/update-law-data.yml` kan fortfarande startas manuellt vid särskilt behov, men dess egna schemalagda och push-baserade körningar är avstängda. Alla ordinarie ändringar i svensk lagtext bör först göras i Lagbok och därefter speglas till Desktop. Detta minimerar dubbla ändringar och konflikter.

Synkroniseringen gör en teknisk kontroll; den ersätter inte juridisk sakgranskning av nya regler eller manuella gränssnittstester i Windows vid större förändringar.
