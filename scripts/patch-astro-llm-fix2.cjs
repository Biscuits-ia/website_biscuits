const fs = require('fs');
const p = 'astro.config.mjs';
let s = fs.readFileSync(p, 'utf8');
// The error is `userAgent: string[] not assignable to string`.
// astro-robots-txt types might require a string OR they want us to use the array form differently.
// Looking at the error: "Type 'string[]' is not assignable to type 'string'." at line 100 col 11.
// Line 100 is `userAgent: [`. We need to use `userAgent: [...].join(' ')` or use the array form per docs.
// Per astro-robots-txt docs, the property is just `userAgent` (string). For multiple agents they
// need a separate policy block per user agent. Or there's a multi-agent syntax. Let me check.
// Actually astro-robots-txt v1.0 supports array form. But the type def might be outdated.
// Safest: use the verbose form - one block per user agent. But that's huge (15 agents).
// Alternative: use the multi-agent pattern via separate blocks OR convert to wildcard match string.
// Looking at real robots.txt, you can\'t have userAgent as array - each policy block is per agent.
// But astro-robots-txt provides a special syntax: a policy can target multiple agents if you pass
// `userAgent: 'GPTBot'`. The way to handle multiple is to have one block per user agent, OR use
// the special combined name 'GPTBot | ClaudeBot | ...' which is NOT valid robots.txt.
// Real solution: use `userAgent: ['GPTBot', 'ClaudeBot', ...]` is supported per
// https://github.com/alextim/astro-robots-txt - but our error says it\'s not typed.
// Workaround: cast as any.
const old = "        {\n          userAgent: [\n            'GPTBot',";
const newB = "        /** @type {any} */\n        {\n          userAgent: [\n            'GPTBot',";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(p, s, 'utf8');
console.log('OK fix2');
