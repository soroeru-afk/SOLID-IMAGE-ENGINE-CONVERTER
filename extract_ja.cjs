const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const strings = new Set();

// 文字列リテラル内の日本語
const jaRegex = /(['"`])(?:(?!\1).)*[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FA5]+(?:(?!\1).)*\1/g;
let match;
while ((match = jaRegex.exec(content)) !== null) {
  strings.add(match[0]);
}

// JSXテキスト内の日本語
const jsxTextRegex = />((?:[^<\{]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FA5]+(?:[^<\{]|{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*})*)</g;

while ((match = jsxTextRegex.exec(content)) !== null) {
  strings.add(match[1].trim());
}

console.log(Array.from(strings).join('\n'));
