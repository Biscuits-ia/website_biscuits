const fs = require('fs');
const path = 'src/components/BaseHead.astro';
let s = fs.readFileSync(path, 'utf8');
// 1. gtag is referenced via dataLayer.push(arguments) but the function name itself is "unused" by ts.
//    Just remove the wrapper - we push to dataLayer directly elsewhere.
// Actually looking again: the function `gtag` is declared but never called. The whole dataLayer.push
// block was the legacy GTM snippet. Let me just remove the `function gtag() { ... }` line entirely.
s = s.replace("    function _gtag() { dataLayer.push(arguments); }\n", "");
fs.writeFileSync(path, s, 'utf8');
console.log('OK h-basehead');
