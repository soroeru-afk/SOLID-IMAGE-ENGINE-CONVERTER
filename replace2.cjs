const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const replacements = [
  ['bg-[#121212]', 'bg-[var(--bg-main)]'],
  ['bg-[#1A1F2B]', 'bg-[var(--bg-button)]'],
  ['bg-[#141820]', 'bg-[var(--bg-panel)]'],
  ['bg-[#0E1116]', 'bg-[var(--bg-deep)]'],
  ['bg-[#212631]', 'bg-[var(--bg-input)]'],
  ['bg-[#2A3441]', 'bg-[var(--bg-hover)]'],
  ['bg-[#2D3748]', 'bg-[var(--border-focus)]'],
  ['border-[#212631]', 'border-[var(--border-color)]'],
  ['border-[#2D3748]', 'border-[var(--border-focus)]'],
  ['border-[#324B77]', 'border-[var(--theme-accent-sub)]'],
  ['text-[#4A5568]', 'text-[var(--text-muted)]'],
  ['text-[#A0ABC0]', 'text-[var(--text-secondary)]'],
  ['text-[#E2E8F0]', 'text-[var(--text-primary)]'],
  ['text-[#718096]', 'text-[var(--text-muted)]'],
  ['divide-[#212631]', 'divide-[var(--border-color)]'],
  ['bg-black/50', 'bg-[var(--bg-overlay)]'],
  ['bg-black/80', 'bg-[var(--bg-overlay-deep)]'],
];

for (const [find, replace] of replacements) {
  code = code.split(find).join(replace);
}

fs.writeFileSync('src/App.tsx', code);
