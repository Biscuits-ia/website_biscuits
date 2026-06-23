const fs = require('fs');

// La regex matche bien le fichier. Le probleme vient du test global.
// Verifions avec le meme chemin.
const c = fs.readFileSync('src/pages/api/user-appointments/[id].ts', 'utf8');
const re = /export\s+const\s+DELETE\b/;
console.log('match:', re.test(c));

// Et avec le prefixe complet comme dans le test
const testRe = new RegExp('export\\s+const\\s+DELETE\\b');
console.log('test match:', testRe.test(c));
