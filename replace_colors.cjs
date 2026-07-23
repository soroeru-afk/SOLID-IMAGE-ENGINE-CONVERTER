const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  ['hover:text-white', 'hover:text-[var(--text-primary)]'],
  ['text-white', 'text-[var(--text-primary)]'],
  ['hover:text-black', 'hover:text-[var(--text-inverse)]'],
  ['text-black', 'text-[var(--text-inverse)]'],
  ['bg-[#324B77]', 'bg-[var(--bg-hover)]'],
  ['to-[#1A263D]', 'to-[var(--theme-accent-dark)]'],
  ['to-[#141820]', 'to-[var(--bg-panel)]'],
  ['from-[#1A1F2B]', 'from-[var(--bg-button)]'],
  ['disabled:to-[#141820]', 'disabled:to-[var(--bg-panel)]']
];

for (const [find, replace] of replacements) {
  code = code.split(find).join(replace);
}

fs.writeFileSync('src/App.tsx', code);
