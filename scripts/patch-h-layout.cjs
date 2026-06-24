const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');
// analyticsDisabled is set on window.__ANALYTICS_DISABLED__ via inline script
s = s.replace('const _analyticsDisabled = import.meta.env.PUBLIC_ANALYTICS_DISABLED === \'true\';', 'const _analyticsDisabled = import.meta.env.PUBLIC_ANALYTICS_DISABLED === \'true\'; if (_analyticsDisabled && typeof window !== "undefined") (window as unknown as { __ANALYTICS_DISABLED__?: boolean }).__ANALYTICS_DISABLED__ = true;');
fs.writeFileSync(path, s, 'utf8');
console.log('OK h-layout');
