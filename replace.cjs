const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/#00E5FF/g, 'var(--theme-accent)');
content = content.replace(/0,229,255/g, 'var(--theme-accent-rgb)');
content = content.replace(/#324B77/g, 'var(--theme-accent-sub)');
content = content.replace(/#008B99/g, 'var(--theme-accent-dark)');

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx updated.');
