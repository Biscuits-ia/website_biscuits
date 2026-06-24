const fs = require('fs');
const path = 'src/pages/dashboard/benevole/project/[id].astro';
let s = fs.readFileSync(path, 'utf8');
// Change the script tag to use is:inline (already done) and rename memberOptions -> memberOptionsData in define:vars
// to avoid colliding with the local `const memberOptions` inside the script. Actually
// looking again: the warning is on line 728 col 36 which is the `const memberOptions = JSON.parse(memberOptionsJson);` line.
// The issue: in the <script is:inline> block, the `memberOptions` identifier is BOTH the local
// `const` and the `define:vars` value with the same name. We need to rename the local to avoid
// the `as` cast / shadowing.

const old = "  const memberOptions = JSON.parse(memberOptionsJson);";
const newB = "  const _memberOptions = JSON.parse(memberOptionsJson);";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);

// And update the usage of `memberOptions.filter(...)` and others
s = s.split("const filtered = memberOptions.filter(m =>").join("const filtered = _memberOptions.filter(m =>");
s = s.split("memberOptions.map(m =>").join("_memberOptions.map(m =>");
s = s.split("memberOptions.find(m =>").join("_memberOptions.find(m =>");
s = s.split("memberOptions.some(m =>").join("_memberOptions.some(m =>");
s = s.split("memberOptions.forEach(m =>").join("_memberOptions.forEach(m =>");

fs.writeFileSync(path, s, 'utf8');
console.log('OK h18 memberOptions rename');
