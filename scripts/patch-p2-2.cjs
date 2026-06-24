const fs = require('fs');
const NL = '\n';

const path = 'src/pages/dashboard/benevole/project/[id].astro';
let s = fs.readFileSync(path, 'utf8');

// 1. Add is:inline directive to the script tag (it's already define:vars so it is effectively inline,
//    but TS errors point to the type annotations inside it which require is:inline explicit + pure JS).
//    We move the typed code to a separate non-inline <script> that can be processed by Astro.
//    Simpler fix: strip the TypeScript types from the inline script so no compile errors.

const old =
  '<script define:vars={{ projectId, memberOptionsJson, userId, isMember, isStaff, userName }}>';

const newB =
  '<script is:inline define:vars={{ projectId, memberOptionsJson, userId, isMember, isStaff, userName }}>';

if (!s.includes(old)) { console.error('NOT FOUND p2-2 script tag'); process.exit(1); }
s = s.replace(old, newB);

// 2. Strip TS annotations inside the inline script - we only have 2 type-bearing lines
// Find and replace the type-cast on window.supabase
const oldCast = "const supabaseRealtime = (window as { supabase?: { channel: Function } }).supabase;";
const newCast = "const supabaseRealtime = (window).supabase;";
if (!s.includes(oldCast)) { console.error('NOT FOUND p2-2 cast'); process.exit(1); }
s = s.replace(oldCast, newCast);

// 3. Strip the payload type annotation
const oldPayload = "            (payload: { new: { created_at: string; [k: string]: unknown } }) => {";
const newPayload = "            (payload) => {";
if (!s.includes(oldPayload)) { console.error('NOT FOUND p2-2 payload'); process.exit(1); }
s = s.replace(oldPayload, newPayload);

// 4. Access payload.new.created_at via a safer destructure - payload is now `any`-like
// We don't need changes because we just stripped the annotation.

fs.writeFileSync(path, s, 'utf8');
console.log('OK p2-2 is:inline + strip TS');
