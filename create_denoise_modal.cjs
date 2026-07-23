const fs = require('fs');

const modalCode = `
const DenoisePreviewModal = ({ 
  fileItem, denoiseLevel, setDenoiseLevel, denoiseRect, setDenoiseRect, onClose, t 
}: { 
  fileItem: FileItem, 
  denoiseLevel: number, 
  setDenoiseLevel: (v: number) => void, 
  denoiseRect: {x: number, y: number, w: number, h: number} | null,
  setDenoiseRect: (v: {x: number, y: number, w: number, h: number} | null) => void,
  onClose: () => void, 
  t: any 
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = React.useState(false);
  const [startPos, setStartPos] = React.useState({x: 0, y: 0});
  const [currentPos, setCurrentPos] = React.useState({x: 0, y: 0});
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({x: 0, y: 0});
  const [isPanning, setIsPanning] = React.useState(false);
  const [lastPan, setLastPan] = React.useState({x: 0, y: 0});
  const [isSpaceDown, setIsSpaceDown] = React.useState(false);
  const [renderInfo, setRenderInfo] = React.useState<{scale: number, offsetX: number, offsetY: number, imgW: number, imgH: number} | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  React.useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const srcW = img.width, srcH = img.height;

      const canvas = canvasRef.current;
      const maxW = 1200;
      let drawW = srcW;
      let drawH = srcH;
      if (drawW > maxW) {
         drawH = (drawH * maxW) / drawW;
         drawW = maxW;
      }
      
      canvas.width = drawW;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, drawW, drawH);
        
        // Only apply denoise to the rect (or full if no rect)
        if (denoiseLevel > 0) {
            let startX = 0, startY = 0, endX = drawW, endY = drawH;
            if (denoiseRect) {
                startX = Math.floor(denoiseRect.x * drawW);
                startY = Math.floor(denoiseRect.y * drawH);
                endX = startX + Math.floor(denoiseRect.w * drawW);
                endY = startY + Math.floor(denoiseRect.h * drawH);
            }

            let imageData = ctx.getImageData(0, 0, drawW, drawH);
            let src = imageData.data;
            const dst = new Uint8ClampedArray(src.length);
            const rArr = new Uint8Array(9);
            const gArr = new Uint8Array(9);
            const bArr = new Uint8Array(9);
            
            if (denoiseRect) dst.set(src);

            for (let iter = 0; iter < denoiseLevel; iter++) {
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        let i = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                let nx = x + dx;
                                let ny = y + dy;
                                if (nx < 0) nx = 0; else if (nx >= drawW) nx = drawW - 1;
                                if (ny < 0) ny = 0; else if (ny >= drawH) ny = drawH - 1;
                                const idx = (ny * drawW + nx) * 4;
                                rArr[i] = src[idx];
                                gArr[i] = src[idx+1];
                                bArr[i] = src[idx+2];
                                i++;
                            }
                        }
                        rArr.sort();
                        gArr.sort();
                        bArr.sort();
                        const pIdx = (y * drawW + x) * 4;
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
            if (denoiseRect) {
                ctx.putImageData(new ImageData(dst, drawW, drawH), 0, 0);
            } else {
                ctx.putImageData(new ImageData(dst, drawW, drawH), 0, 0);
            }
        }
      }

      if (containerRef.current) {
         const cr = containerRef.current.getBoundingClientRect();
         const isContainerWide = (cr.width / cr.height) > (drawW / drawH);
         let renderedW, renderedH;
         if (isContainerWide) {
             renderedH = cr.height;
             renderedW = drawW * (cr.height / drawH);
         } else {
             renderedW = cr.width;
             renderedH = drawH * (cr.width / drawW);
         }
         const offsetX = (cr.width - renderedW) / 2;
         const offsetY = (cr.height - renderedH) / 2;
         setRenderInfo({ scale: renderedW / srcW, offsetX, offsetY, imgW: srcW, imgH: srcH });
      }
    };
    img.src = fileItem.previewUrl;
  }, [fileItem, denoiseLevel, denoiseRect]);

  const handleWheel = (e: React.WheelEvent) => {
      const scaleChange = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.1, Math.min(10, z * scaleChange)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      if (!renderInfo || !containerRef.current) return;
      if (e.button === 1 || e.button === 2 || isSpaceDown) {
          setIsPanning(true);
          setLastPan({x: e.clientX, y: e.clientY});
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
      }
      if (e.button !== 0) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left) - rect.width / 2;
      const cy = (e.clientY - rect.top) - rect.height / 2;
      const px = cx - pan.x;
      const py = cy - pan.y;
      const x = px / zoom + rect.width / 2;
      const y = py / zoom + rect.height / 2;

      setIsDragging(true);
      setStartPos({x, y});
      setCurrentPos({x, y});
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (isPanning) {
         const dx = e.clientX - lastPan.x;
         const dy = e.clientY - lastPan.y;
         setPan(p => ({x: p.x + dx, y: p.y + dy}));
         setLastPan({x: e.clientX, y: e.clientY});
         return;
      }

      if (!isDragging || !renderInfo || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left) - rect.width / 2;
      const cy = (e.clientY - rect.top) - rect.height / 2;
      const px = cx - pan.x;
      const py = cy - pan.y;
      const x = px / zoom + rect.width / 2;
      const y = py / zoom + rect.height / 2;
      setCurrentPos({x, y});
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (isPanning) {
         setIsPanning(false);
         e.currentTarget.releasePointerCapture(e.pointerId);
         return;
      }
      if (!isDragging || !renderInfo) return;
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
      
      const px = Math.min(startPos.x, currentPos.x) - renderInfo.offsetX;
      const py = Math.min(startPos.y, currentPos.y) - renderInfo.offsetY;
      const pw = Math.abs(currentPos.x - startPos.x);
      const ph = Math.abs(currentPos.y - startPos.y);

      const renderedW = renderInfo.imgW * renderInfo.scale;
      const renderedH = renderInfo.imgH * renderInfo.scale;

      const cx = Math.max(0, Math.min(1, px / renderedW));
      const cy = Math.max(0, Math.min(1, py / renderedH));
      let cw = Math.max(0, Math.min(1 - cx, pw / renderedW));
      let ch = Math.max(0, Math.min(1 - cy, ph / renderedH));

      if (cw > 0.05 && ch > 0.05) {
          setDenoiseRect({ x: cx, y: cy, w: cw, h: ch });
      } else {
          setDenoiseRect(null); // click to reset
      }
  };

  const getAreaStyle = () => {
      if (!renderInfo) return {};
      const renderedW = renderInfo.imgW * renderInfo.scale;
      const renderedH = renderInfo.imgH * renderInfo.scale;
      
      let x1, y1, w, h;
      if (isDragging) {
         x1 = Math.min(startPos.x, currentPos.x);
         y1 = Math.min(startPos.y, currentPos.y);
         w = Math.abs(currentPos.x - startPos.x);
         h = Math.abs(currentPos.y - startPos.y);
      } else if (denoiseRect) {
         x1 = renderInfo.offsetX + denoiseRect.x * renderedW;
         y1 = renderInfo.offsetY + denoiseRect.y * renderedH;
         w = denoiseRect.w * renderedW;
         h = denoiseRect.h * renderedH;
      } else {
         return { display: 'none' };
      }

      return {
          left: x1 + 'px',
          top: y1 + 'px',
          width: w + 'px',
          height: h + 'px'
      };
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-2 sm:p-4 lg:p-8 backdrop-blur-md" onClick={onClose}>
       <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm p-4 w-full flex-1 min-h-0 max-w-7xl flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center shrink-0">
             <div className="flex flex-col">
                <span className="text-[var(--theme-accent)] font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                   DENOISE PREVIEW & AREA SELECT
                   {zoom !== 1 && <span className="px-2 py-0.5 rounded-sm bg-[var(--theme-accent-sub)] text-[var(--text-primary)] text-[10px]">ZOOM: {Math.round(zoom * 100)}%</span>}
                </span>
                <span className="text-[var(--text-secondary)] text-[10px] tracking-wider">Drag to select area. Click to reset to full image.</span>
             </div>
             <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕ CLOSE</button>
          </div>
          
          <div 
             ref={containerRef}
             onWheel={handleWheel}
             className="flex-1 min-h-0 bg-[var(--bg-deep)] bg-checkerboard border border-[var(--border-color)] relative rounded-sm overflow-hidden touch-none"
          >
             <div 
               style={{ transform: \`translate(\${pan.x}px, \${pan.y}px) scale(\${zoom})\`, transformOrigin: 'center' }}
               className="w-full h-full absolute inset-0 flex items-center justify-center"
               onPointerDown={handlePointerDown}
               onPointerMove={handlePointerMove}
               onPointerUp={handlePointerUp}
               onPointerLeave={handlePointerUp}
               onContextMenu={e => e.preventDefault()}
             >
                 <canvas ref={canvasRef} className="max-w-full max-h-full object-contain pointer-events-none" />
                 
                 {(isDragging || denoiseRect) && (
                     <>
                       <div className="absolute inset-0 bg-black/30 pointer-events-none" style={{ clipPath: \`polygon(0% 0%, 0% 100%, \${getAreaStyle().left} 100%, \${getAreaStyle().left} \${getAreaStyle().top}, calc(\${getAreaStyle().left} + \${getAreaStyle().width}) \${getAreaStyle().top}, calc(\${getAreaStyle().left} + \${getAreaStyle().width}) calc(\${getAreaStyle().top} + \${getAreaStyle().height}), \${getAreaStyle().left} calc(\${getAreaStyle().top} + \${getAreaStyle().height}), \${getAreaStyle().left} 100%, 100% 100%, 100% 0%)\` }}></div>
                       <div className="absolute pointer-events-none border border-[var(--theme-accent)] shadow-[0_0_0_1px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(0,0,0,0.5)]" style={{ ...getAreaStyle(), boxSizing: 'border-box' }}>
                       </div>
                     </>
                 )}
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

// Match the existing DenoisePreviewModal and replace it.
const startIdx = content.indexOf('const DenoisePreviewModal = ({');
const endIdx = content.indexOf('const ResultPreviewModal = ({');

if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + modalCode + '\n' + content.substring(endIdx);
    fs.writeFileSync('src/App.tsx', content, 'utf8');
    console.log('Replaced DenoisePreviewModal');
} else {
    console.log('Could not find boundaries');
}
