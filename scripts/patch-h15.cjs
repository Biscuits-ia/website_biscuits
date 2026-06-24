const fs = require('fs');
const p = 'src/pages/api/groupes/index.ts';
let s = fs.readFileSync(p, 'utf8');
// rateLimitResponse IS used (if (...) return ...). The warning must be about narrowing after
// the discriminator. Since flat has both `ctx` and `status` (and rateLimitResponse in both branches),
// when we destructure `const { ctx, rateLimitResponse } = flat` AFTER `if (!flat.ok) return ...`,
// TS knows flat is the {ok:true} branch, which DOES have rateLimitResponse. So it should work.
// Let me just inline the if check to remove the destructure ambiguity.

const old = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  const { ctx, rateLimitResponse } = flat;\n  if (rateLimitResponse) return rateLimitResponse;";
const newB = "  if (!flat.ok) return jsonError('Non autorise.', flat.status);\n  if (flat.rateLimitResponse) return flat.rateLimitResponse;\n  const { ctx } = flat;";
const c = s.split(old).length - 1;
console.log('matches:', c);
s = s.split(old).join(newB);
fs.writeFileSync(p, s, 'utf8');
console.log('OK h15');
