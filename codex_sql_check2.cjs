const fs = require('fs');

// Les patterns '' sont en fait CORRECTS en SQL - c\'est la facon d\'echapper
// une apostrophe dans une string SQL definie par ''.
// Exemple : IS 'Membres actifs de l''association'
//          ^                       ^^
//          string ouverte          apostrophe echappee + fin de string
//
// Mon regex etait trop laxiste. Verifions plutot les patterns REELLEMENT
// dangereux : '' suivi immediatement d\'un caractere de debut de regex/identifiant.

const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${item.name}`;
    if (item.isDirectory()) walk(p);
    else if (item.name.endsWith('.sql')) files.push(p);
  }
}
walk('supabase/migration');

let badPatterns = 0;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  // Recherche specifique du bug precedent : ''^[A-Z] (double apostrophe suivi de regex)
  if (content.includes("''^")) {
    console.log('BUG CONFIRME dans ' + f);
    badPatterns++;
  }
  // Ou ''[A-Z] (autre syntaxe suspecte)
  if (content.match(/''\s*\[A-Z]/)) {
    console.log('AUTRE PATTERN dans ' + f);
    badPatterns++;
  }
}

if (badPatterns === 0) console.log('OK - pas de pattern de double apostrophe en debut de string');
