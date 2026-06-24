const fs = require("fs");
const path = "src/layouts/Layout.astro";
let s = fs.readFileSync(path, "utf8");

const oldSw = '  <script is:inline defer nonce={nonce} src="/sw-register.js"></script>';
const swScript = '  <script is:inline nonce={nonce}>\n' +
  '    if (typeof window !== "undefined" && "serviceWorker" in navigator) {\n' +
  '      var reg = function() { navigator.serviceWorker.register("/sw.js").catch(function() {}); };\n' +
  '      if ("requestIdleCallback" in window) window.requestIdleCallback(reg, { timeout: 5000 });\n' +
  '      else window.addEventListener("load", reg);\n' +
  '    }\n' +
  '  </script>';

const c = s.split(oldSw).length - 1;
console.log("matches:", c);
s = s.split(oldSw).join(swScript);
fs.writeFileSync(path, s, "utf8");
console.log("OK sw inline");
