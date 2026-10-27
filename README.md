# Lagbok Desktop

Lagboken som Windows-app: svensk lagtext med hänvisningar, sökning, markeringar och anteckningar, med allt sparat på datorn och utan att internet behövs.

Lagbok Desktop är en egen produkt, skild från mobilappen [Lagboken](https://github.com/Deashi03/Lagbok). Den har eget repo, egna versioner och egen import av lagtext. En uppdatering av den ena påverkar inte den andra.

## Installera
1. Gå till [Releases](https://github.com/Deashi03/lagbok-desktop/releases/latest) och ladda ner `Lagbok.Desktop_…_x64-setup.exe`.
2. Dubbelklicka på filen. Appen installeras för din användare, så ingen administratörsbehörighet behövs.
3. Första gången kan Windows visa "Windows skyddade datorn", eftersom installationsfilen inte är kodsignerad. Klicka **Mer information** och sedan **Kör ändå**.

Appen uppdaterar sig själv: när en ny version finns visas en rad överst, och ett klick installerar den och startar om appen. Avinstallera via Inställningar → Appar.

## Windows-funktioner (1.0)
- **Snabbpanel, Ctrl + Alt + L.** Kortkommandot fungerar var du än är i Windows. Lagbok glider fram längs högerkanten på den skärm där muspekaren är, med en tredjedels bredd och sökfältet redo. Skriv till exempel `BrB 3:8` och tryck Enter. Esc eller samma kortkommando döljer panelen igen. ⤢ öppnar det som visas i huvudfönstret.
- **Ett vanligt Windows-fönster.** Du kan fästa det mot skärmkanterna, använda delad skärm (Win + ←/→, Snap) och ändra storleken fritt. Appen minns storlek, läge och skärm mellan starterna.
- **Ikon vid klockan.** Krysset gömmer appen där, så att kortkommandot alltid fungerar. Från ikonen kan du visa appen, öppna snabbpanelen eller avsluta. Under Inställningar → Windows kan du välja att krysset stänger appen i stället, och att appen startar dold med Windows.
- **Hopplista.** Högerklicka på appen i aktivitetsfältet för att se dina favoriter och de lagrum du läst senast.
- **Lagbok-länkar.** `lagbok://BrB/3/8` eller `lagbok://RB 23:4` i ett mejl, i Word eller i OneNote öppnar lagrummet direkt. Startar man appen en gång till används fönstret som redan är öppet.
- Webb- och e-postlänkar öppnas i Windows standardprogram. Färgtemat kan följa Windows.

## Uppbyggnad
- Webbappen (`index.html`, `assets/`, `data/`) är en kopia av Lagboken 1.6.4. `assets/desktop.js` är Windows-delen. Den gör ingenting i en vanlig webbläsare, så webbtesterna körs som förut.
- `node scripts/bundle.js` slår ihop skripten till `assets/lagboken.js`. Kör den efter varje ändring i `assets/*.js`; testerna kontrollerar att filen är aktuell.
- `src-tauri/` innehåller Windows-skalet ([Tauri 2](https://tauri.app), Rust):
  - fönstren, snabbpanelen och kortkommandot;
  - ikonen vid klockan och starten med Windows;
  - Lagbok-länkarna (`lagbok://`) och hopplistan (`src/jumplist.rs`);
  - de automatiska uppdateringarna.
- `scripts/stage.js` samlar appens filer och lagtexten i `dist/`, som byggs in i programmet. Allt fungerar utan internet.

## Bygga och släppa
- **Release vid ändringar.** `.github/workflows/release.yml` bygger installationsfilen på Windows och lägger ut en release varje gång appen eller lagtexten ändras på `main`. Versionen i `src-tauri/tauri.conf.json` släpps först. Därefter räknas patchversionen upp automatiskt (1.0.0, 1.0.1 …). Ändra versionen där för en ny mindre version (1.1.0).
- **Uppdatering kräver signeringsnyckel.** För att de automatiska uppdateringarna ska fungera måste repot ha hemligheten `TAURI_SIGNING_PRIVATE_KEY` (Settings → Secrets and variables → Actions). Utan den byggs installationsfilen ändå, men installerade appar kan inte uppdatera sig själva.
- **Lagtext varje månad.** `.github/workflows/update-law-data.yml` hämtar lagändringar från riksdagen.se den 1:a varje månad och öppnar en pull request. När den slås ihop byggs en ny version, som appen hämtar själv.

Bygga lokalt på Windows: installera [Node.js](https://nodejs.org) och [Rust](https://rustup.rs), och kör sedan `npm ci` och `npx tauri build`.
