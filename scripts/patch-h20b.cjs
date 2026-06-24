const fs = require('fs');
const path = 'src/pages/dashboard/benevole/project/[id].astro';
let s = fs.readFileSync(path, 'utf8');
const old = "  const _memberOptions = JSON.parse(window.memberOptionsJson || memberOptionsJson);\r\n";
const newB = "  // memberOptionsJson is injected by <script is:inline define:vars>\r\n  // eslint-disable-next-line @typescript-eslint/no-undef\r\n  const _memberOptions = JSON.parse(memberOptionsJson);\r\n";
const c = s.split(old).length - 1;
console.log('matches:', c);
if (c > 0) {
  s = s.split(old).join(newB);
  fs.writeFileSync(path, s, 'utf8');
  console.log('OK h20b');
} else {
  console.log('NO MATCH - check current content');
}
