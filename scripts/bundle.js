// Slår ihop appens skript till assets/lagboken.js, som index.html läser in. En fil i stället för tio
// ger färre förfrågningar genom service workern vid start. Kör efter varje ändring i assets/*.js:
//   node scripts/bundle.js          skriver filen
//   node scripts/bundle.js --check  kontrollerar att filen är aktuell (används av testerna)
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
// Samma ordning som skripten lästes in i index.html: moduler först, sedan appen och Windows-delen.
const FILES=['search-core.js','legal-links.js','editorial.js','law-model.js','search-index.js','highlights.js','toc-model.js','tutorial.js','app.js','desktop.js'];
function build(){
  return '/* Genereras av scripts/bundle.js från assets/'+FILES.join(', ')+'. Ändra i källfilerna, inte här. */\n'+
    FILES.map(f=>'// ---- '+f+' ----\n'+fs.readFileSync(path.join(root,'assets',f),'utf8').replace(/\s*$/,'\n')+';\n').join('');
}
const out=path.join(root,'assets','lagboken.js');
if(process.argv.includes('--check')){
  if(!fs.existsSync(out)||fs.readFileSync(out,'utf8')!==build()){console.error('assets/lagboken.js är inte aktuell: kör node scripts/bundle.js');process.exit(1);}
  console.log('assets/lagboken.js är aktuell');
}else{fs.writeFileSync(out,build());console.log('Skrev assets/lagboken.js');}
