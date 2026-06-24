const fs = require('fs');
const path = 'src/pages/blog/tag/[tag].astro';
let s = fs.readFileSync(path, 'utf8');
// Drop my earlier wrong insert; just keep the original destructure & use the value (or rename to _).
s = s.replace("const { tagDisplay, tagSlug, totalCount } = Astro.props as {\n  tagDisplay: string;\n  totalCount: number;\n  // eslint-disable-next-line @typescript-eslint/no-unused-vars\n  tagSlug: string;\n  totalCount: number;\n};",
              "const { tagDisplay, tagSlug, totalCount: _totalCount } = Astro.props as { tagDisplay: string; tagSlug: string; totalCount: number };");
fs.writeFileSync(path, s, 'utf8');
console.log('OK h-tag');
