const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  ['bg-[#12161F]', 'bg-[var(--bg-hover)]'],
  ['bg-[#4A5568]', 'bg-[var(--text-muted)]'],
];

for (const [find, replace] of replacements) {
  code = code.split(find).join(replace);
}

fs.writeFileSync('src/App.tsx', code);
