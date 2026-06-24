const fs = require('fs');
const path = 'src/styles/global.css';
let s = fs.readFileSync(path, 'utf8');
// Remove the @import for Inter (line 1). We use only Zalando Sans SemiExpanded (in BaseHead).
const old = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');\n";
s = s.replace(old, '');
fs.writeFileSync(path, s, 'utf8');
console.log('OK global.css @import removed');
