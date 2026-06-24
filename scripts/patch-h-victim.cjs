const fs = require('fs');
const path = 'src/components/react/VictimForm.tsx';
let s = fs.readFileSync(path, 'utf8');
// 1. Drop unused FormEvent import
s = s.replace("import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';",
              "import { useCallback, useState, type ChangeEvent } from 'react';");
// 2. Type signature is already updated to React.FormEvent
fs.writeFileSync(path, s, 'utf8');
console.log('OK h-victim');
