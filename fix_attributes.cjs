const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/title=t\.resetState/g, "title={t.resetState}");
content = content.replace(/title=t\.saveImage/g, "title={t.saveImage}");
content = content.replace(/title=t\.removeFromList/g, "title={t.removeFromList}");
content = content.replace(/title=t\.colorPickerTitle/g, "title={t.colorPickerTitle}");
content = content.replace(/\{ type: 'error', text: t\.unsupportedFileSkip \}/g, "{ type: 'error', text: t.unsupportedFileSkip }"); // this might be fine
content = content.replace(/alert\(t\.copySuccess\);/g, "alert(t.copySuccess);");

// Let's check status translations, ensure they are compiled correctly
// content.replace(/t\.statusIdle/g, ...

fs.writeFileSync('src/App.tsx', content, 'utf8');
