// Samlar det Lagbok Desktop behöver i dist/, som Tauri bygger in i appen: index.html, stilar, den
// sammanslagna skriptfilen, ikonen och lagtexten med index. Körs automatiskt före varje bygge.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});
const copy=(rel)=>{const from=path.join(root,rel),to=path.join(dist,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true});};
require('./bundle.js');
for(const rel of ['index.html','icon.svg','assets/app.css','assets/lagboken.js','data/index','data/laws'])copy(rel);
// Releasebygget sätter versionsnumret (LAGBOK_VERSION); appen visar samma nummer som installationen.
if(process.env.LAGBOK_VERSION){
  const js=path.join(dist,'assets','lagboken.js'),src=fs.readFileSync(js,'utf8');
  if(!/const APP_VERSION='[^']*'/.test(src))throw Error('APP_VERSION saknas i lagboken.js');
  fs.writeFileSync(js,src.replace(/const APP_VERSION='[^']*'/,"const APP_VERSION='"+process.env.LAGBOK_VERSION+"'"));
}
// Övriga datafiler som appen läser direkt (katalogen som reserv, ändringar); inte källfiler för importen.
for(const f of fs.readdirSync(path.join(root,'data')))
  if(/\.json$/.test(f)&&!['forarbeten.json','completeness.json','audit-baseline.json'].includes(f))copy('data/'+f);
let files=0,bytes=0;(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else{files++;bytes+=fs.statSync(p).size;}}})(dist);
console.log('dist/: '+files+' filer, '+(bytes/1e6).toFixed(0)+' MB');
