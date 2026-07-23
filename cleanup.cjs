const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// The file structure is:
// 1. imports -> OcrTunerModal -> ResultPreviewModal -> AdjustPreviewModal -> THEMES
// 2. new DenoisePreviewModal (inserted by me)
// 3. ResultPreviewModal -> AdjustPreviewModal -> THEMES -> old DenoisePreviewModal -> App component

// We need to remove the first ResultPreviewModal and AdjustPreviewModal and THEMES? 
// No, the ones BEFORE the new DenoisePreviewModal are correct. 
// Wait, the "first" ones (0 to startIdx) are from 0 to 682. This includes them!
// Then the new DenoisePreviewModal is inserted.
// Then the script appended substring(259). This means it added ResultPreviewModal -> AdjustPreviewModal -> THEMES again!
// So from the end of new DenoisePreviewModal until the OLD DenoisePreviewModal (which was replaced), we have a duplicate block.

const idx1 = content.indexOf('const ResultPreviewModal'); // at 259
const idx2 = content.indexOf('const ResultPreviewModal', idx1 + 10); // the duplicate!
const idxOldDenoise = content.indexOf('export default function App() {'); // After the old DenoisePreviewModal

if (idx2 !== -1 && idxOldDenoise !== -1) {
    // We want to delete from idx2 up to just before export default function App
    // Wait, the duplicate block starts at idx2. It goes all the way up to where the old DenoisePreviewModal was!
    // But wait, the second block also contains a DenoisePreviewModal (the old one) because substring(259) includes it!
    
    // Actually, everything from idx2 up to 'export default function App() {' is:
    // ResultPreviewModal -> AdjustPreviewModal -> THEMES -> old DenoisePreviewModal
    
    content = content.substring(0, idx2) + '\n' + content.substring(idxOldDenoise);
    fs.writeFileSync('src/App.tsx', content, 'utf8');
    console.log("Cleanup successful");
} else {
    console.log("Could not find duplicates");
}
