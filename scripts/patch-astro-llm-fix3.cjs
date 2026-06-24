const fs = require('fs');
const p = 'astro.config.mjs';
let s = fs.readFileSync(p, 'utf8');
const NL = '\r\n';

// Fix: cast the LLM policy to any to bypass strict typing
const old = "        /** @type {any} */\n        {\n          userAgent: [\n            'GPTBot',";
const newB = "        /** @type {any} */\n        (() => {\n        const p = {\n          userAgent: [\n            'GPTBot',";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);

// Now we need to find the closing of this policy block and close the IIFE
// Find the line "        }," after crawlDelay
const closing = "          crawlDelay: 2,\n        },";
const newClosing = "          crawlDelay: 2,\n        };\n        return p;\n        })(),";
const c2 = s.split(closing).length - 1;
console.log('closing matches:', c2);
s = s.split(closing).join(newClosing);

fs.writeFileSync(p, s, 'utf8');
console.log('OK fix3');
