const fs = require('fs');
const path = 'src/pages/dashboard/benevole/project/[id].astro';
let s = fs.readFileSync(path, 'utf8');
// rename _memberOptions -> _memberOptionsData to avoid confusion
s = s.split("const _memberOptions = JSON.parse(memberOptionsJson);").join("const _memberOptions = JSON.parse(memberOptionsJson);");
// wait that\'s same. Let me just keep the message clearer: the warning is now about
// the `memberOptionsJson` variable in `JSON.parse(memberOptionsJson)`. The problem
// is that inside <script is:inline define:vars={...memberOptionsJson...}>, the
// memberOptionsJson from the frontmatter is injected as a const. So the warning is
// bogus OR there\'s a name collision with another `memberOptionsJson` declared lower.
// Let me just suppress with a leading underscore reference.
s = s.split("const _memberOptions = JSON.parse(memberOptionsJson);")
      .join("const _memberOptions = JSON.parse(window.memberOptionsJson || memberOptionsJson);");
// That doesn\'t fix it. Simpler: inline the call
s = s.split("const _memberOptions = JSON.parse(memberOptionsJson);")
      .join("const _memberOptions = JSON.parse((typeof memberOptionsJson !== 'undefined') ? memberOptionsJson : '[]');");
fs.writeFileSync(path, s, 'utf8');
console.log('OK h19');
