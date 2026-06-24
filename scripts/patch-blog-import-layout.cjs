const fs = require('fs');
const path = 'src/pages/blog/[...slug].astro';
let s = fs.readFileSync(path, 'utf8');
// Page uses `Layout` (imported from @/layouts/Layout.astro). Confirm.
// Now, the error says "Type ... is not assignable to type IntrinsicAttributes & Props"
// The Props type of Layout has been extended. Let me check if the Layout component is from
// @/layouts/Layout.astro or some wrapper.
// Yes it\'s `import Layout from "@/layouts/Layout.astro";`. So the error is real.
// The issue: my new geo prop is not in the actual compiled Layout.astro (it should be, I patched it).
// Let me check what the layout actually exports.
console.log('snippet:');
const lines = s.split(/\r\n/);
console.log(lines.slice(7, 12).join('\n'));
