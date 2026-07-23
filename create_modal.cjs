const fs = require('fs');

const modalCode = `
const DenoisePreviewModal = ({ 
  fileItem, denoiseLevel, setDenoiseLevel, onClose, t 
}: { 
  fileItem: FileItem, denoiseLevel: number, setDenoiseLevel: (v: number) => void, onClose: () => void, t: any 
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  
  React.useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!canvasRef.current) return;
      const can = canvasRef.current;
      
      const maxDim = 800;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.floor(h * (maxDim / w));
          w = maxDim;
        } else {
          w = Math.floor(w * (maxDim / h));
          h = maxDim;
        }
      }
      can.width = w;
      can.height = h;
      const ctx = can.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      
      if (denoiseLevel > 0) {
        let imageData = ctx.getImageData(0, 0, w, h);
        let src = imageData.data;
        const dst = new Uint8ClampedArray(src.length);
        const rArr = new Uint8Array(9);
        const gArr = new Uint8Array(9);
        const bArr = new Uint8Array(9);

        for (let iter = 0; iter < denoiseLevel; iter++) {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    let i = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            let nx = x + dx;
                            let ny = y + dy;
                            if (nx < 0) nx = 0; else if (nx >= w) nx = w - 1;
                            if (ny < 0) ny = 0; else if (ny >= h) ny = h - 1;
                            const idx = (ny * w + nx) * 4;
                            rArr[i] = src[idx];
                            gArr[i] = src[idx+1];
                            bArr[i] = src[idx+2];
                            i++;
                        }
                    }
                    rArr.sort();
                    gArr.sort();
                    bArr.sort();
                    const pIdx = (y * w + x) * 4;
                    dst[pIdx] = rArr[4];
                    dst[pIdx+1] = gArr[4];
                    dst[pIdx+2] = bArr[4];
                    dst[pIdx+3] = src[pIdx+3];
                }
            }
            if (iter < denoiseLevel - 1) {
                src.set(dst);
            }
        }
        ctx.putImageData(new ImageData(dst, w, h), 0, 0);
      }
    };
    img.src = fileItem.previewUrl;
  }, [fileItem, denoiseLevel]);

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-overlay-deep)] flex flex-col items-center justify-center p-4 lg:p-8 backdrop-blur-sm" onClick={onClose}>
       <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm p-4 w-full max-w-5xl max-h-[90vh] flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center shrink-0">
             <div className="flex flex-col">
                <span className="text-[var(--theme-accent)] font-bold text-sm tracking-widest uppercase">DENOISE PREVIEW</span>
                <span className="text-[var(--text-secondary)] text-[10px] tracking-wider">{t.denoiseSetting}</span>
             </div>
             <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕</button>
          </div>
          <div className="flex-1 min-h-0 bg-checkerboard border border-[var(--border-color)] relative rounded-sm flex items-center justify-center overflow-hidden">
             <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
             <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[8px] text-[var(--theme-accent)] font-bold">
                PREVIEWING FILTER
             </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0 bg-[var(--bg-deep)] p-4 border border-[var(--border-color)] rounded-sm">
             <div className="space-y-1">
                 <div className="flex justify-between items-end">
                     <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">ITERATIONS (STRENGTH)</span>
                     <span className="text-[10px] text-[var(--theme-accent)]">{denoiseLevel}</span>
                 </div>
                 <input type="range" min="1" max="5" step="1" value={denoiseLevel} onChange={e => setDenoiseLevel(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
             </div>
          </div>
       </div>
    </div>
  );
};
`;

let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace('export default function App() {', modalCode + '\nexport default function App() {');

const renderModal = `
      {denoisePreviewItem && (
          <DenoisePreviewModal
             fileItem={denoisePreviewItem}
             denoiseLevel={denoiseLevel}
             setDenoiseLevel={setDenoiseLevel}
             onClose={() => setDenoisePreviewItem(null)}
             t={t}
          />
      )}
`;

content = content.replace('{inspectModalItem && (', renderModal + '{inspectModalItem && (');
fs.writeFileSync('src/App.tsx', content, 'utf8');
