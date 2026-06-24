const fs = require('fs');
const NL = '\n';

// Remove unused variables/imports (ts(6133)). Idempotent.

const patches = [
  // 1. appointmentHelpers.ts: getTemporalState imported but unused
  { file: 'src/lib/appointmentHelpers.ts', find: 'import { formatDateLong, toHHmm, getTemporalState, type TemporalState } from \'@/lib/dateHelpers\';', replace: 'import { formatDateLong, toHHmm, type TemporalState } from \'@/lib/dateHelpers\';' },
  // 2. email-queue.ts: MIN_RETRY_SECONDS declared but unused
  { file: 'src/lib/email-queue.ts', find: 'const MIN_RETRY_SECONDS = 60;\n', replace: '' },
  // 3. ateliers.astro: category parameter is never used (it's a function param)
  { file: 'src/pages/ateliers.astro', find: 'function levelIcon(level: string | null, category: string | null): string {', replace: 'function levelIcon(level: string | null, _category: string | null): string {' },
  // 4. BaseHead.astro: gtag is declared but never used (we still call window.dataLayer.push, so prefix with _)
  { file: 'src/components/BaseHead.astro', find: '    function gtag() { dataLayer.push(arguments); }', replace: '    function _gtag() { dataLayer.push(arguments); }' },
  // 5. Breadcrumb.astro: lastIsCurrent unused
  { file: 'src/components/Breadcrumb.astro', find: 'const lastIsCurrent = crumbs.length > 1 ? crumbs.pop() : null;\n', replace: '' },
  // 6. Footer.astro: Icon imported but unused
  { file: 'src/components/Footer.astro', find: 'import { Icon } from \'astro-icon/components\';\n', replace: '' },
  // 7. Layout.astro: analyticsDisabled declared but never read in this file
  { file: 'src/layouts/Layout.astro', find: 'const analyticsDisabled = import.meta.env.PUBLIC_ANALYTICS_DISABLED === \'true\';', replace: 'const _analyticsDisabled = import.meta.env.PUBLIC_ANALYTICS_DISABLED === \'true\';' },
  // 8. formations export-csv.ts: formatDate declared but unused (just remove the function)
  { file: 'src/pages/api/admin/formations/export-csv.ts', find: 'function formatDate(iso: string | null | undefined): string {\n  if (!iso) return \'\';\n  return new Date(iso).toLocaleDateString(\'fr-FR\', { year: \'numeric\', month: \'2-digit\', day: \'2-digit\' });\n}\n\n', replace: '' },
  // 9. refund.ts: formatDateLong + formatTimeRange unused - drop them from import (keep formatPriceCents)
  { file: 'src/pages/api/admin/formations/refund.ts', find: 'import { formatDateLong, formatTimeRange, formatPriceCents } from \'@/types/formations\';', replace: 'import { formatPriceCents } from \'@/types/formations\';' },
  // 10. validate-payment.ts: renderAdminNotification unused
  { file: 'src/pages/api/admin/formations/validate-payment.ts', find: 'import { renderFreeRequestDecision, renderAdminNotification, type MailAddress } from \'@/lib/mail\';', replace: 'import { renderFreeRequestDecision, type MailAddress } from \'@/lib/mail\';' },
];

for (const { file, find, replace } of patches) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(find)) { console.log('SKIP', file); continue; }
  s = s.replace(find, replace);
  fs.writeFileSync(file, s, 'utf8');
  console.log('OK', file);
}
