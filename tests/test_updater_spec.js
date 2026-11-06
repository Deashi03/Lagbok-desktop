// Verify that the advertised release and all build manifests agree.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const version='1.1.3';
for(const [file,pattern] of [
  ['src-tauri/tauri.conf.json',/"version": "([^"]+)"/],
  ['package.json',/"version": "([^"]+)"/],
  ['package-lock.json',/"version": "([^"]+)"/],
  ['src-tauri/Cargo.toml',/^version = "([^"]+)"/m],
  ['src-tauri/Cargo.lock',/\[\[package\]\]\s*\nname = "lagbok-desktop"\s*\nversion = "([^"]+)"/],
  ['assets/app.js',/const APP_VERSION='([^']+)'/]
]) {
  const m=get(file).match(pattern);
  assert.ok(m,'version missing in '+file);
  assert.equal(m[1],version,'version mismatch in '+file);
}
const html=get('index.html');
assert.match(html,/<button[^>]*id="top-version"/,'version badge must be clickable');
assert.match(html,/aria-label="Sök efter uppdateringar"/);
const desktop=get('assets/desktop.js');
assert.match(desktop,/whenReady\(\(\)=>setTimeout\(\(\)=>checkForUpdates\(\),300\)\)/,'startup check');
assert.match(desktop,/versionButton\.addEventListener\('click'/,'manual check on version button');
assert.match(desktop,/Ladda ner manuellt/,'manual fallback');
assert.match(desktop,/installing=true/,'prevent double install clicks');
const rust=get('src-tauri/src/lib.rs');
assert.doesNotMatch(rust,/from_secs\(8\)/,'no race-prone delayed native update event');
assert.match(rust,/update\.download_and_install/);
const cfg=JSON.parse(get('src-tauri/tauri.conf.json'));
assert.ok(cfg.plugins.updater.pubkey&&cfg.plugins.updater.endpoints.some(u=>u.includes('latest.json')),'signed updater configured');
assert.equal(cfg.bundle.createUpdaterArtifacts,true);
console.log('Desktop 1.1.3: versions and automatic/manual updater contracts passed');
