// assets/lagboken.js måste byggas om när något av appens skript ändras.
require('node:child_process').execFileSync('node',[require('node:path').join(__dirname,'..','scripts','bundle.js'),'--check'],{stdio:'inherit'});
