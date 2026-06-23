const fs = require('fs');
const path = require('path');

const dir = 'C:\\\\Users\\\\Sweetosky\\\\Documents\\\\htdoc\\\\Biscuits IA\\\\website_biscuits\\\\src\\\\content\\\\blog';
const newArticles = ['comparatif-ia-open-source-2026.mdx', 'ollama-heberger-llm-local.mdx', 'materiel-cloud-ia-open-source.mdx'];

for (const f of newArticles) {
  const fullPath = path.join(dir, f);
  let content = fs.readFileSync(fullPath, 'utf8');
  const before = content;
  
  // Find all icon: 'value' or title: 'value' or description: 'value' where value has ''
  // and convert to double-quoted strings
  
  // Use state machine: for each line that has icon:|title:|description:
  // parse the value (handle escaped apostrophes)
  const lines = content.split('\n');
  const newLines = lines.map((line) => {
    if (!line.match(/^\s*(icon|title|description):/)) return line;
    
    // Find key: 'value'
    const m = line.match(/^(\s*(?:icon|title|description):\s*)(')(.*)(')\s*(,?)\s*$/);
    if (!m) return line;
    
    const prefix = m[1];
    const valueWithEscapes = m[3];
    // Replace '' with just ' in the value
    const cleanValue = valueWithEscapes.replace(/''/g, "'");
    // Re-serialize with double quotes
    return prefix + '"' + cleanValue + '"' + (m[4] ? ',' : '');
  });
  content = newLines.join('\n');
  
  if (content !== before) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Fixed: ' + f);
  }
}
