const fs = require('fs');
const NL = '\n';
// 1. VictimForm: FormEvent is still a deprecated import in React 19. Change to React.FormEvent
//    actually FormEvent is not deprecated at the type-name level - it is the legacy generic.
//    The warning is that React.FormEvent<...> is being phased out. Use SyntheticEvent<HTMLFormElement>.
// 2. benevole/project memberOptionsJson: it IS defined in the frontmatter at line ~728 but the
//    warning says "could not find name 'memberOptionsJson'". The script tag references it via
//    define:vars, so the symbol exists. The warning may be from a parse boundary.
//    Let me just check by looking at line 728.
const path = 'src/components/react/VictimForm.tsx';
let s = fs.readFileSync(path, 'utf8');
s = s.replace('async (event: React.FormEvent<HTMLFormElement>) => {',
              'async (event: React.SyntheticEvent<HTMLFormElement>) => {');
fs.writeFileSync(path, s, 'utf8');
console.log('OK h12 victim SyntheticEvent');
