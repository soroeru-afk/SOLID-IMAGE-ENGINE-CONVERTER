import { useI18n } from './i18n';
import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import heic2any from 'heic2any';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { UploadCloud, Download, Image as ImageIcon, Trash2, Settings, Monitor, Layers, Play, CheckCircle2, Copy, RotateCcw, ChevronLeft, ChevronRight, PanelLeft, PanelRight } from 'lucide-react';
import * as piexif from 'piexifjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type ProcessStatus = 'idle' | 'processing' | 'done' | 'error';
type FileItem = {
  id: string;
  file: File;
  status: ProcessStatus;
  progress: number;
  resultBlob?: Blob;
  resultUrl?: string;
  errorMsg?: string;
  previewUrl: string;
  selected: boolean;
  extractedText?: string;
  adjust?: {
    exposure: number;
    saturation: number;
    contrast: number;
    threshold: number;
    grayscale: boolean;
    invert: boolean;
    cropRect: {x: number, y: number, w: number, h: number} | null;
  };
};

function rgbToHex(r: number, g: number, b: number) {
  return "#" + ( (1 << 24) + (r << 16) + (g << 8) + b ).toString(16).slice(1).toUpperCase();
}

const EyeDropperModal = ({ fileItem, onClose, onColorSelect, t }: { fileItem: FileItem, onClose: () => void, onColorSelect: (hex: string) => void, t: any }) => {
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleImageLoad = () => {
    if (imgRef.current && canvasRef.current) {
       const can = canvasRef.current;
       const img = imgRef.current;
       can.width = img.naturalWidth;
       can.height = img.naturalHeight;
       const ctx = can.getContext('2d', { willReadFrequently: true });
       if (ctx) ctx.drawImage(img, 0, 0);
    }
  };

  const getColorAtEvent = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !canvasRef.current) return null;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    
    // Scale coordinates accurately
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    
    // Boundary check
    if (x < 0 || y < 0 || x >= img.naturalWidth || y >= img.naturalHeight) return null;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return rgbToHex(pixel[0], pixel[1], pixel[2]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const hex = getColorAtEvent(e);
    if (hex) setHoverColor(hex);
  };

  const handleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const hex = getColorAtEvent(e);
    if (hex) onColorSelect(hex);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-overlay-deep)] flex flex-col items-center justify-center p-4 lg:p-8 backdrop-blur-sm" onClick={onClose}>
       <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm p-4 w-full max-w-5xl max-h-[90vh] flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center shrink-0">
             <div className="flex flex-col">
                <span className="text-[var(--theme-accent)] font-bold text-sm tracking-widest uppercase">IMAGE INSPECTOR</span>
                <span className="text-[var(--text-secondary)] text-[10px] tracking-wider">{t.imgInspectorDesc}</span>
             </div>
             <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕</button>
          </div>
          
          <div className="flex-1 min-h-0 bg-checkerboard border border-[var(--border-color)] relative rounded-sm flex items-center justify-center overflow-hidden cursor-crosshair">
             <canvas ref={canvasRef} className="hidden" />
             <img 
               ref={imgRef}
               src={fileItem.previewUrl} 
               alt="Inspect" 
               className="max-w-full max-h-full object-contain"
               onLoad={handleImageLoad}
               onMouseMove={handleMouseMove}
               onMouseLeave={() => setHoverColor(null)}
               onClick={handleClick}
               crossOrigin="anonymous"
             />
          </div>

          <div className="flex items-center justify-between shrink-0 h-10">
             <div className="flex items-center gap-3">
                {hoverColor ? (
                   <>
                     <div className="w-8 h-8 rounded-sm border border-[var(--border-focus)]" style={{ backgroundColor: hoverColor }}></div>
                     <span className="text-[var(--text-primary)] font-mono text-xs">{hoverColor}</span>
                     <span className="text-[var(--text-muted)] text-[10px] ml-2 tracking-wider">{t.clickToSelect}</span>
                   </>
                ) : (
                   <span className="text-[var(--text-muted)] text-[10px] tracking-wider">{t.mouseOverToPick}</span>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};

const OcrTunerModal = ({ 
  fileItem, contrast, brightness, invert, upscale,
  setContrast, setBrightness, setInvert, setUpscale, onClose, t 
}: { 
  fileItem: FileItem, contrast: number, brightness: number, invert: boolean, upscale: number,
  setContrast: (v: number) => void, setBrightness: (v: number) => void, setInvert: (v: boolean) => void, setUpscale: (v: number) => void,
  onClose: () => void, t: any 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!canvasRef.current) return;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          let adjusted = (gray - 128) * contrast + 128 + brightness;
          adjusted = Math.min(255, Math.max(0, adjusted));
          if (invert) adjusted = 255 - adjusted;
          
          data[i] = data[i+1] = data[i+2] = adjusted;
        }
        
        tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0);

        // Apply upscale & sharpen for preview
        const finalCanvas = document.createElement('canvas');
        const scaledWidth = Math.floor(tempCanvas.width * upscale);
        const scaledHeight = Math.floor(tempCanvas.height * upscale);
        finalCanvas.width = scaledWidth;
        finalCanvas.height = scaledHeight;
        const fCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
        if (fCtx) {
           fCtx.imageSmoothingEnabled = true;
           fCtx.imageSmoothingQuality = 'high';
           fCtx.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight);
           
           const fData = fCtx.getImageData(0, 0, scaledWidth, scaledHeight);
           const pData = fData.data;
           const oData = new Uint8ClampedArray(pData.length);
           const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
           for (let y = 1; y < scaledHeight - 1; y++) {
             for (let x = 1; x < scaledWidth - 1; x++) {
               for (let c = 0; c < 3; c++) {
                 let sum = 0;
                 for (let ky = 0; ky < 3; ky++) {
                   for (let kx = 0; kx < 3; kx++) {
                     sum += pData[((y + ky - 1) * scaledWidth + (x + kx - 1)) * 4 + c] * kernel[ky * 3 + kx];
                   }
                 }
                 oData[(y * scaledWidth + x) * 4 + c] = Math.min(255, Math.max(0, sum));
               }
               oData[(y * scaledWidth + x) * 4 + 3] = pData[(y * scaledWidth + x) * 4 + 3];
             }
           }
           fCtx.putImageData(new ImageData(oData, scaledWidth, scaledHeight), 0, 0);
        }

        canvasRef.current.width = finalCanvas.width;
        canvasRef.current.height = finalCanvas.height;
        const outCtx = canvasRef.current.getContext('2d');
        outCtx?.drawImage(finalCanvas, 0, 0);
      }
    };
    img.src = fileItem.previewUrl;
  }, [fileItem, contrast, brightness, invert, upscale]);

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-overlay-deep)] flex flex-col items-center justify-center p-4 lg:p-8 backdrop-blur-sm" onClick={onClose}>
       <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm p-4 w-full max-w-5xl max-h-[90vh] flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center shrink-0">
             <div className="flex flex-col">
                <span className="text-[var(--theme-accent)] font-bold text-sm tracking-widest uppercase">OCR PREVIEW & TUNING</span>
                <span className="text-[var(--text-secondary)] text-[10px] tracking-wider">{t.ocrPreviewDesc}</span>
             </div>
             <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕</button>
          </div>
          
          <div className="flex-1 min-h-0 bg-checkerboard border border-[var(--border-color)] relative rounded-sm flex items-center justify-center overflow-hidden">
             <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
             <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[8px] text-[var(--theme-accent)] font-bold">
                PREVIEWING OCR INPUT
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0 bg-[var(--bg-deep)] p-4 border border-[var(--border-color)] rounded-sm">
             <div className="space-y-1">
                 <div className="flex justify-between items-end">
                     <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">CONTRAST</span>
                     <span className="text-[10px] text-[var(--theme-accent)]">{contrast.toFixed(1)}</span>
                 </div>
                 <input type="range" min="0.5" max="3.0" step="0.1" value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
             </div>
             <div className="space-y-1">
                 <div className="flex justify-between items-end">
                     <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">BRIGHTNESS</span>
                     <span className="text-[10px] text-[var(--theme-accent)]">{brightness}</span>
                 </div>
                 <input type="range" min="-100" max="100" step="5" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
             </div>
             <div className="space-y-1">
                 <div className="flex justify-between items-end">
                     <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.upscaleForOcr}</span>
                     <span className="text-[10px] text-[var(--theme-accent)]">{upscale.toFixed(1)}x</span>
                 </div>
                 <input type="range" min="1.0" max="4.0" step="0.5" value={upscale} onChange={e => setUpscale(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
             </div>
             <div className="flex items-center pt-2">
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} className="accent-[var(--theme-accent)] w-4 h-4 cursor-pointer" />
                    <span className="text-[10px] text-[var(--text-primary)] tracking-wider font-bold">INVERT</span>
                 </label>
             </div>
          </div>
       </div>
    </div>
  );
};

const ResultPreviewModal = ({ fileItem, onClose, onNext, onPrev, t }: { fileItem: FileItem, onClose: () => void, onNext?: () => void, onPrev?: () => void, t: any }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev]);

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg-overlay-deep)] flex flex-col items-center justify-center p-4 lg:p-8 backdrop-blur-sm" onClick={onClose}>
       <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm p-4 w-full max-w-5xl max-h-[90vh] flex flex-col gap-4 shadow-2xl relative" onClick={e => e.stopPropagation()}>
          {onPrev && (
            <button onClick={onPrev} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/30 border border-white/20 rounded-full text-white/50 hover:text-white hover:bg-black/50 hover:border-white/50 transition-all z-50 backdrop-blur-sm">
               <ChevronLeft size={24} />
            </button>
          )}
          {onNext && (
            <button onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/30 border border-white/20 rounded-full text-white/50 hover:text-white hover:bg-black/50 hover:border-white/50 transition-all z-50 backdrop-blur-sm">
               <ChevronRight size={24} />
            </button>
          )}
          <div className="flex justify-between items-center shrink-0">
             <div className="flex flex-col">
                <span className="text-[var(--theme-accent)] font-bold text-sm tracking-widest uppercase">RESULT PREVIEW</span>
                <span className="text-[var(--text-secondary)] text-[10px] tracking-wider">{fileItem.extractedText ? t.resultPreviewWithText : t.resultPreviewImageOnly}</span>
             </div>
             <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕</button>
          </div>
          <div className={`flex-1 min-h-0 flex ${fileItem.extractedText ? 'flex-col md:flex-row gap-4' : ''}`}>
             <div className="flex-1 bg-[var(--bg-deep)] bg-checkerboard border border-[var(--border-color)] relative rounded-sm flex items-center justify-center overflow-hidden min-h-[30vh]">
                 <img 
                   src={fileItem.resultUrl} 
                   alt="Result" 
                   className="max-w-full max-h-full object-contain"
                 />
             </div>
             {fileItem.extractedText && (
                 <div className="flex-1 md:max-w-[400px] bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-sm p-4 flex flex-col min-h-[30vh]">
                    <div className="text-[var(--theme-accent)] text-[10px] font-bold tracking-widest mb-3 uppercase flex items-center justify-between border-b border-[var(--border-color)] pb-2 shrink-0">
                        <span>{t.extractedTextTitle}</span>
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(fileItem.extractedText || '');
                            }}
                            className="bg-[var(--bg-button)] hover:bg-[var(--theme-accent-sub)] px-2 py-1 rounded-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                        >
                            <Copy size={10} /> COPY
                        </button>
                    </div>
                    <textarea 
                        readOnly 
                        value={fileItem.extractedText}
                        className="flex-1 w-full bg-transparent border-0 outline-none text-[var(--text-primary)] text-sm resize-none font-mono leading-relaxed custom-scrollbar"
                    />
                 </div>
             )}
          </div>
       </div>
    </div>
  );
};

export type ImageAdjustments = {
  exposure: number;
  saturation: number;
  contrast: number;
  threshold: number;
  grayscale: boolean;
  invert: boolean;
  cropRect: {x: number, y: number, w: number, h: number} | null;
};

const AdjustPreviewModal = ({ 
  fileItem, globalAdjust, onSave, onSync, onClose, onNext, onPrev, t 
}: { 
  fileItem: FileItem, 
  globalAdjust: ImageAdjustments,
  onSave: (id: string, adjust: ImageAdjustments) => void,
  onSync: (adjust: ImageAdjustments) => void,
  onClose: () => void,
  onNext?: () => void,
  onPrev?: () => void,
  t: any 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [exposure, setExposure] = useState(fileItem.adjust?.exposure ?? globalAdjust.exposure);
  const [saturation, setSaturation] = useState(fileItem.adjust?.saturation ?? globalAdjust.saturation);
  const [contrast, setContrast] = useState(fileItem.adjust?.contrast ?? globalAdjust.contrast);
  const [threshold, setThreshold] = useState(fileItem.adjust?.threshold ?? globalAdjust.threshold);
  const [grayscale, setGrayscale] = useState(fileItem.adjust?.grayscale ?? globalAdjust.grayscale);
  const [invert, setInvert] = useState(fileItem.adjust?.invert ?? globalAdjust.invert);
  const [cropRect, setCropRect] = useState<{x: number, y: number, w: number, h: number} | null>(fileItem.adjust?.cropRect !== undefined ? fileItem.adjust.cropRect : globalAdjust.cropRect);
  
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({x: 0, y: 0});
  const [currentPos, setCurrentPos] = useState({x: 0, y: 0});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [isPanning, setIsPanning] = useState(false);
  const [lastPan, setLastPan] = useState({x: 0, y: 0});
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  
  const [renderInfo, setRenderInfo] = useState<{scale: number, offsetX: number, offsetY: number, imgW: number, imgH: number} | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') setIsSpaceDown(true);
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
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
  }, [onNext, onPrev]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!canvasRef.current) return;
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
        
        if (exposure !== 0 || saturation !== 100 || contrast !== 100 || threshold > 0 || grayscale || invert) {
            const imageData = ctx.getImageData(0, 0, drawW, drawH);
            const data = imageData.data;
            const satRatio = saturation / 100;
            const contFactor = (259 * (contrast - 100 + 255)) / (255 * (259 - (contrast - 100)));
            
            for (let i = 0; i < data.length; i += 4) {
              let r = data[i];
              let g = data[i+1];
              let b = data[i+2];
              
              r += exposure;
              g += exposure;
              b += exposure;
              
              if (contrast !== 100) {
                 r = contFactor * (r - 128) + 128;
                 g = contFactor * (g - 128) + 128;
                 b = contFactor * (b - 128) + 128;
              }
              
              if (saturation !== 100) {
                 const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                 r = gray + (r - gray) * satRatio;
                 g = gray + (g - gray) * satRatio;
                 b = gray + (b - gray) * satRatio;
              }
              
              if (grayscale) {
                 const lum = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                 r = lum; g = lum; b = lum;
              }
              
              if (invert) {
                 r = 255 - r;
                 g = 255 - g;
                 b = 255 - b;
              }
              
              if (threshold > 0) {
                 const lum = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                 const val = lum >= threshold ? 255 : 0;
                 r = val; g = val; b = val;
              }
              
              data[i] = Math.min(255, Math.max(0, r));
              data[i+1] = Math.min(255, Math.max(0, g));
              data[i+2] = Math.min(255, Math.max(0, b));
            }
            ctx.putImageData(imageData, 0, 0);
        }
      }

      // Compute display layout for crop overlay
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
  }, [fileItem, exposure, saturation, contrast, threshold, grayscale, invert]);

  const handleWheel = (e: React.WheelEvent) => {
      const scaleChange = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.1, Math.min(10, z * scaleChange)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      // Allow scrolling modal area directly if it wasn't the canvas?
      // Actually we attached it to the inner wrapper, anyway.
      if (!renderInfo || !containerRef.current) return;
      if (e.button === 1 || e.button === 2 || isSpaceDown) {
          setIsPanning(true);
          setLastPan({x: e.clientX, y: e.clientY});
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
      }
      if (e.button !== 0) return; // Only left click for cropping
      
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
          setCropRect({ x: cx, y: cy, w: cw, h: ch });
      }
  };

  const getCropStyle = () => {
      if (!renderInfo) return {};
      const renderedW = renderInfo.imgW * renderInfo.scale;
      const renderedH = renderInfo.imgH * renderInfo.scale;
      
      let x1, y1, w, h;
      if (isDragging) {
         x1 = Math.min(startPos.x, currentPos.x);
         y1 = Math.min(startPos.y, currentPos.y);
         w = Math.abs(currentPos.x - startPos.x);
         h = Math.abs(currentPos.y - startPos.y);
      } else if (cropRect) {
         x1 = renderInfo.offsetX + cropRect.x * renderedW;
         y1 = renderInfo.offsetY + cropRect.y * renderedH;
         w = cropRect.w * renderedW;
         h = cropRect.h * renderedH;
      } else {
         return { display: 'none' };
      }

      return {
          left: `${x1}px`,
          top: `${y1}px`,
          width: `${w}px`,
          height: `${h}px`
      };
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-2 sm:p-4 lg:p-8 backdrop-blur-md" onClick={onClose}>
       <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm p-4 w-full flex-1 min-h-0 max-w-7xl flex flex-col gap-4 shadow-2xl relative" onClick={e => e.stopPropagation()}>
          {onPrev && (
            <button onClick={onPrev} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/30 border border-white/20 rounded-full text-white/50 hover:text-white hover:bg-black/50 hover:border-white/50 transition-all z-50 backdrop-blur-sm">
               <ChevronLeft size={24} />
            </button>
          )}
          {onNext && (
            <button onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/30 border border-white/20 rounded-full text-white/50 hover:text-white hover:bg-black/50 hover:border-white/50 transition-all z-50 backdrop-blur-sm">
               <ChevronRight size={24} />
            </button>
          )}
          <div className="flex justify-between items-center shrink-0">
             <div className="flex flex-col">
                <span className="text-[var(--theme-accent)] font-bold text-sm tracking-widest uppercase flex items-center gap-2">
                   ADJUST & CROP PREVIEW
                   {zoom !== 1 && <span className="px-2 py-0.5 rounded-sm bg-[var(--theme-accent-sub)] text-[var(--text-primary)] text-[10px]">ZOOM: {Math.round(zoom * 100)}%</span>}
                </span>
                <span className="text-[var(--text-secondary)] text-[10px] tracking-wider">{t.adjustModalDesc}</span>
             </div>
             <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2">✕ CLOSE</button>
          </div>
          
          <div 
             ref={containerRef}
             onWheel={handleWheel}
             className="flex-1 min-h-0 bg-[var(--bg-deep)] bg-checkerboard border border-[var(--border-color)] relative rounded-sm overflow-hidden touch-none"
          >
             <div 
               style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
               className="w-full h-full absolute inset-0 flex items-center justify-center"
               onPointerDown={handlePointerDown}
               onPointerMove={handlePointerMove}
               onPointerUp={handlePointerUp}
               onPointerLeave={handlePointerUp}
               onContextMenu={e => e.preventDefault()}
             >
                 <canvas ref={canvasRef} className="max-w-full max-h-full object-contain pointer-events-none" />
                 
                 {(isDragging || cropRect) && (
                     <>
                       <div className="absolute inset-0 bg-black/60 pointer-events-none" style={{ clipPath: `polygon(0% 0%, 0% 100%, ${getCropStyle().left} 100%, ${getCropStyle().left} ${getCropStyle().top}, calc(${getCropStyle().left} + ${getCropStyle().width}) ${getCropStyle().top}, calc(${getCropStyle().left} + ${getCropStyle().width}) calc(${getCropStyle().top} + ${getCropStyle().height}), ${getCropStyle().left} calc(${getCropStyle().top} + ${getCropStyle().height}), ${getCropStyle().left} 100%, 100% 100%, 100% 0%)` }}></div>
                       <div className="absolute pointer-events-none border border-[var(--theme-accent)] shadow-[0_0_0_1px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(0,0,0,0.5)]" style={{ ...getCropStyle(), boxSizing: 'border-box' }}>
                           <div className="absolute top-1/3 left-0 w-full h-[1px] bg-white/30 border-b border-black/30"></div>
                           <div className="absolute top-2/3 left-0 w-full h-[1px] bg-white/30 border-b border-black/30"></div>
                           <div className="absolute left-1/3 top-0 h-full w-[1px] bg-white/30 border-r border-black/30"></div>
                           <div className="absolute left-2/3 top-0 h-full w-[1px] bg-white/30 border-r border-black/30"></div>
                       </div>
                     </>
                 )}
             </div>
          </div>

          <div className="shrink-0 p-4 bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-sm space-y-4 max-h-[30vh] overflow-y-auto custom-scrollbar">
             <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-wrap">
                 <div className="flex-1 min-w-[150px] space-y-1">
                     <div className="flex justify-between items-end">
                         <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.exposureLbl}</span>
                         <span className="text-[10px] text-[var(--theme-accent)]">{exposure}</span>
                     </div>
                     <input type="range" min="-100" max="100" step="5" value={exposure} onChange={e => setExposure(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
                 </div>
                 <div className="flex-1 min-w-[150px] space-y-1">
                     <div className="flex justify-between items-end">
                         <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.saturationLbl}</span>
                         <span className="text-[10px] text-[var(--theme-accent)]">{saturation}</span>
                     </div>
                     <input type="range" min="0" max="200" step="5" value={saturation} onChange={e => setSaturation(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
                 </div>
                 <div className="flex-1 min-w-[150px] space-y-1">
                     <div className="flex justify-between items-end">
                         <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.contrastLbl}</span>
                         <span className="text-[10px] text-[var(--theme-accent)]">{contrast}%</span>
                     </div>
                     <input type="range" min="0" max="200" step="5" value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
                 </div>
                 <div className="flex-1 min-w-[150px] space-y-1">
                     <div className="flex justify-between items-end">
                         <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.thresholdLbl}</span>
                         <span className="text-[10px] text-[var(--theme-accent)]">{threshold === 0 ? 'OFF' : threshold}</span>
                     </div>
                     <input type="range" min="0" max="255" step="1" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
                 </div>
                 <div className="flex-1 flex gap-4 min-w-[150px]">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={grayscale} onChange={e => setGrayscale(e.target.checked)} className="accent-[var(--theme-accent)] w-4 h-4 cursor-pointer" />
                        <span className="text-[10px] text-[var(--text-primary)] tracking-wider font-bold">MONOCHROME</span>
                     </label>
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} className="accent-[var(--theme-accent)] w-4 h-4 cursor-pointer" />
                        <span className="text-[10px] text-[var(--text-primary)] tracking-wider font-bold">INVERT</span>
                     </label>
                 </div>
                 <button 
                   onClick={() => {
                     setCropRect(null); setExposure(0); setSaturation(100); setContrast(100); setThreshold(0); setGrayscale(false); setInvert(false); setZoom(1); setPan({x:0, y:0});
                   }}
                   className="mt-2 shrink-0 bg-[var(--bg-button)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-sm text-[10px] tracking-wider transition-colors"
                 >
                   RESET View
                 </button>
             </div>
             
             <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[var(--border-color)]">
                <button 
                   onClick={() => onSave(fileItem.id, { exposure, saturation, contrast, threshold, grayscale, invert, cropRect })}
                   className="flex-1 bg-[var(--theme-accent-sub)] hover:bg-[var(--theme-accent)] text-[var(--text-primary)] px-4 py-2 rounded-sm text-xs font-bold tracking-widest transition-colors shadow-lg"
                >
                   SAVE TO THIS IMAGE
                </button>
                <button 
                   onClick={() => onSync({ exposure, saturation, contrast, threshold, grayscale, invert, cropRect })}
                   className="flex-1 bg-transparent border border-[var(--theme-accent-sub)] hover:border-[var(--theme-accent)] text-[var(--text-secondary)] hover:text-[var(--theme-accent)] px-4 py-2 rounded-sm text-xs font-bold tracking-widest transition-colors"
                >
                   SYNC TO ALL SELECTED IMAGES
                </button>
             </div>
          </div>
       </div>
    </div>
  );
};

const THEMES = {
  dark: { accent: "#00E5FF", rgb: "0, 229, 255", sub: "#324B77", dark: "#008B99", mode: "dark", label: "DARK" },
  light: { accent: "#0f172a", rgb: "15, 23, 42", sub: "#94a3b8", dark: "#000000", mode: "light", label: "LIGHT" }
};



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
               style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
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
                       <div className="absolute inset-0 bg-black/30 pointer-events-none" style={{ clipPath: `polygon(0% 0%, 0% 100%, ${getAreaStyle().left} 100%, ${getAreaStyle().left} ${getAreaStyle().top}, calc(${getAreaStyle().left} + ${getAreaStyle().width}) ${getAreaStyle().top}, calc(${getAreaStyle().left} + ${getAreaStyle().width}) calc(${getAreaStyle().top} + ${getAreaStyle().height}), ${getAreaStyle().left} calc(${getAreaStyle().top} + ${getAreaStyle().height}), ${getAreaStyle().left} 100%, 100% 100%, 100% 0%)` }}></div>
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


export default function App() {
  const { t, lang, setLang } = useI18n();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [outputFormat, setOutputFormat] = useState('image/png');
  const [quality, setQuality] = useState(0.8);
  const [resizeMode, setResizeMode] = useState<'none' | 'scale' | 'exact'>('none');
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [exactWidth, setExactWidth] = useState(1920);
  const [exactHeight, setExactHeight] = useState(1080);
  const [isProcessing, setIsProcessing] = useState(false);
  const [removeColor, setRemoveColor] = useState(false);
  const [enableDenoise, setEnableDenoise] = useState(false);
  const [denoiseLevel, setDenoiseLevel] = useState(1);
  const [denoiseRect, setDenoiseRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [denoisePreviewItem, setDenoisePreviewItem] = useState<FileItem | null>(null);
  const [targetColor, setTargetColor] = useState('#FFFFFF');
  const [colorTolerance, setColorTolerance] = useState(10);
  const [namingMode, setNamingMode] = useState<'original' | 'date_seq' | 'custom_seq'>('original');
  const [customPrefix, setCustomPrefix] = useState('image');
  const [enableOcr, setEnableOcr] = useState(false);
  const [ocrLang, setOcrLang] = useState<'eng' | 'jpn' | 'jpn_vert' | 'eng+jpn'>('eng+jpn');
  const [autoRemoveSpaces, setAutoRemoveSpaces] = useState(true);
  const [activeTab, setActiveTab] = useState<'convert' | 'rename' | 'text_scan' | 'metadata'>('convert');
  const [globalMessage, setGlobalMessage] = useState<{type: 'error' | 'info', text: string} | null>(null);
  const [sidebarPosition, setSidebarPosition] = useState<'right' | 'left'>('right');
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number, startWidth: number } | null>(null);
  const [inspectModalItem, setInspectModalItem] = useState<FileItem | null>(null);
  const [ocrPreviewItem, setOcrPreviewItem] = useState<FileItem | null>(null);
  const [resultPreviewItem, setResultPreviewItem] = useState<FileItem | null>(null);
  const [ocrContrast, setOcrContrast] = useState(1.5);
  const [ocrBrightness, setOcrBrightness] = useState(0);
  const [ocrInvert, setOcrInvert] = useState(false);
  const [ocrUpscale, setOcrUpscale] = useState(3.0);
  const [ocrFontSize, setOcrFontSize] = useState(12);
  const [activeTheme, setActiveTheme] = useState<keyof typeof THEMES>('dark');
  
  const [exposure, setExposure] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [threshold, setThreshold] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [adjustInvert, setAdjustInvert] = useState(false);
  const [cropRect, setCropRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [adjustPreviewItem, setAdjustPreviewItem] = useState<FileItem | null>(null);

  const [accFormat, setAccFormat] = useState(false);
  const [accCompress, setAccCompress] = useState(false);
  const [accAdjust, setAccAdjust] = useState(false);
  const [accCrop, setAccCrop] = useState(false);
  const [accResize, setAccResize] = useState(false);
  const [accEffects, setAccEffects] = useState(false);

  const [enableExif, setEnableExif] = useState(false);
  const [exifDateOriginal, setExifDateOriginal] = useState('');
  const [exifDateModified, setExifDateModified] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatExifDate = (datetimeLocalStr: string) => {
      if (!datetimeLocalStr) return '';
      return datetimeLocalStr.replace(/-/g, ':').replace('T', ' ') + ':00';
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
          startX: e.clientX,
          startWidth: sidebarWidth
      };
      setIsResizing(true);
  };

  useEffect(() => {
      if (!isResizing) return;
      
      const handleMouseMove = (e: MouseEvent) => {
          if (!dragRef.current) return;
          const { startX, startWidth } = dragRef.current;
          const delta = e.clientX - startX;
          
          let newWidth;
          if (sidebarPosition === 'right') {
              newWidth = startWidth - delta;
          } else {
              newWidth = startWidth + delta;
          }
          
          if (newWidth < 320) newWidth = 320;
          if (newWidth > 800) newWidth = 800;
          
          setSidebarWidth(newWidth);
      };
      
      const handleMouseUp = () => {
          setIsResizing(false);
          dragRef.current = null;
      };
      
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
          document.body.style.userSelect = '';
      };
  }, [isResizing, sidebarPosition]);

  useEffect(() => {
    const t = THEMES[activeTheme as keyof typeof THEMES];
    if (t) {
      document.documentElement.style.setProperty("--theme-accent", t.accent);
      document.documentElement.style.setProperty("--theme-accent-rgb", t.rgb);
      document.documentElement.style.setProperty("--theme-accent-sub", t.sub);
      document.documentElement.style.setProperty("--theme-accent-dark", t.dark);
      document.documentElement.setAttribute('data-theme', t.mode);
    }
  }, [activeTheme]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };



  useEffect(() => {
    // Add any necessary init here if needed
  }, []);

  const addFiles = async (newFiles: File[]) => {
    const validImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/heic', 'image/heif'];
    let hasInvalid = false;
    
    const itemsPromises = newFiles.map(async f => {
        let fileProcessed = f;
        const nameLower = f.name.toLowerCase();
        
        if (f.type === 'application/pdf' || nameLower.endsWith('.pdf')) {
            try {
                const arrayBuffer = await f.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const numPages = pdf.numPages;
                const pdfItems = [];
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    
                    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
                    if (blob) {
                        const pageFile = new File([blob], `${f.name.replace(/\.pdf$/i, '')}_page${i}.jpg`, { type: 'image/jpeg' });
                        pdfItems.push({
                            id: Math.random().toString(36).substring(7),
                            file: pageFile,
                            status: 'idle' as ProcessStatus,
                            progress: 0,
                            previewUrl: URL.createObjectURL(pageFile),
                            selected: true,
                        });
                    }
                }
                return pdfItems;
            } catch (e) {
                console.error("PDF conversion error:", e);
                hasInvalid = true;
                return null;
            }
        } else if (f.type === 'image/heic' || f.type === 'image/heif' || nameLower.endsWith('.heic') || nameLower.endsWith('.heif')) {
            try {
                const convertedBlob = await heic2any({ blob: f, toType: 'image/jpeg' }) as Blob | Blob[];
                const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                fileProcessed = new File([blob], f.name.replace(/\.heif$/i, '.jpg').replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
            } catch (e) {
                console.error("HEIC conversion error:", e);
                hasInvalid = true;
                return null;
            }
        } else if (nameLower.endsWith('.exif')) {
            // Grokなど一部のAIツールが誤った拡張子(.exif)で出力した画像へのフォールバック対応（実態はJPEG等と見做す）
            fileProcessed = new File([f], f.name, { type: 'image/jpeg' });
        } else if (!validImageTypes.includes(f.type) && !nameLower.endsWith('.jpg') && !nameLower.endsWith('.png')) {
            hasInvalid = true;
            return null;
        }

        return {
            id: Math.random().toString(36).substring(7),
            file: fileProcessed,
            status: 'idle' as ProcessStatus,
            progress: 0,
            previewUrl: URL.createObjectURL(fileProcessed),
            selected: true,
        };
    });

    const parsedItems = await Promise.all(itemsPromises);
    const validItems = parsedItems.flat().filter(item => item !== null) as FileItem[];

    if (!exifDateOriginal && !exifDateModified && validItems.length > 0) {
        const firstFile = validItems[0].file;
        
        const fallbackDate = () => {
            const d = new Date(firstFile.lastModified);
            // format as YYYY-MM-DDTHH:MM:SS
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };

        if (firstFile.type === 'image/jpeg') {
            const reader = new FileReader();
            reader.onload = e => {
                let foundOrig = false;
                let foundMod = false;
                try {
                    const exifObj = (piexif as any).load(e.target?.result as string);
                    const dtOrig = exifObj["Exif"][(piexif as any).ExifIFD.DateTimeOriginal];
                    const dtMod = exifObj["0th"][(piexif as any).ImageIFD.DateTime];
                    
                    const parseExifDate = (dt: string) => {
                        if (!dt) return '';
                        const parts = dt.split(' ');
                        if (parts.length === 2) {
                            return parts[0].replace(/:/g, '-') + 'T' + parts[1];
                        }
                        return '';
                    };

                    if (dtOrig) {
                        setExifDateOriginal(parseExifDate(dtOrig));
                        foundOrig = true;
                    }
                    if (dtMod) {
                        setExifDateModified(parseExifDate(dtMod));
                        foundMod = true;
                    }
                } catch(e) {}

                if (!foundOrig) setExifDateOriginal(fallbackDate());
                if (!foundMod) setExifDateModified(fallbackDate());
            };
            reader.readAsDataURL(firstFile);
        } else {
            const fb = fallbackDate();
            setExifDateOriginal(fb);
            setExifDateModified(fb);
        }
    }

    if (hasInvalid) {
      setGlobalMessage({ type: 'error', text: t.unsupportedFileSkip });
      setTimeout(() => setGlobalMessage(null), 5000);
    }
    setFiles(prev => [...prev, ...validItems]);
  };

  const toggleSelect = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
  };

  const toggleSelectAll = () => {
    const allSelected = files.length > 0 && files.every(f => f.selected);
    setFiles(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.previewUrl);
        if (file.resultUrl) URL.revokeObjectURL(file.resultUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };
  
  const resetFileState = (id: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === id && f.status === 'done') {
        if (f.resultUrl) URL.revokeObjectURL(f.resultUrl);
        return {
          ...f,
          status: 'idle',
          progress: 0,
          resultBlob: undefined,
          resultUrl: undefined,
          extractedText: undefined
        };
      }
      return f;
    }));
  };

  const resetSelected = () => {
    setFiles(prev => prev.map(f => {
      if (f.selected && f.status === 'done') {
        if (f.resultUrl) URL.revokeObjectURL(f.resultUrl);
        return {
          ...f,
          status: 'idle',
          progress: 0,
          resultBlob: undefined,
          resultUrl: undefined,
          extractedText: undefined
        };
      }
      return f;
    }));
  };

  const clearAll = () => {
    files.forEach(f => {
      URL.revokeObjectURL(f.previewUrl);
      if (f.resultUrl) URL.revokeObjectURL(f.resultUrl);
    });
    setFiles([]);
  };

  const removeSpacesFromFile = (id: string) => {
    setFiles(prev => prev.map(f => {
       if (f.id === id && f.extractedText) {
          return { ...f, extractedText: f.extractedText.replace(/[ 　]/g, '') };
       }
       return f;
    }));
  };

  const processImageCanvas = (item: FileItem): Promise<{blob: Blob, canvas: HTMLCanvasElement}> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const itemExp = item.adjust?.exposure ?? exposure;
        const itemSat = item.adjust?.saturation ?? saturation;
        const itemCont = item.adjust?.contrast ?? contrast;
        const itemThresh = item.adjust?.threshold ?? threshold;
        const itemGrayscale = item.adjust?.grayscale ?? grayscale;
        const itemInvert = item.adjust?.invert ?? adjustInvert;
        const itemCrop = item.adjust?.cropRect !== undefined ? item.adjust.cropRect : cropRect;

        let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;

        if (itemCrop) {
            srcX = Math.round(itemCrop.x * img.width);
            srcY = Math.round(itemCrop.y * img.height);
            srcW = Math.round(itemCrop.w * img.width);
            srcH = Math.round(itemCrop.h * img.height);
        }

        const canvas = document.createElement('canvas');
        let width = srcW;
        let height = srcH;

        if (resizeMode === 'scale') {
          width = Math.max(1, Math.round(width * scaleFactor));
          height = Math.max(1, Math.round(height * scaleFactor));
        } else if (resizeMode === 'exact') {
          width = Math.max(1, exactWidth);
          height = Math.max(1, exactHeight);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context not found'));

        // Fill background with white if JPEG (since JPEG doesn't support alpha transparency)
        if (outputFormat === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }
        
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, width, height);

        if (itemExp !== 0 || itemSat !== 100 || itemCont !== 100 || itemThresh > 0 || itemGrayscale || itemInvert) {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const satRatio = itemSat / 100;
            const contFactor = (259 * (itemCont - 100 + 255)) / (255 * (259 - (itemCont - 100)));
            
            for (let i = 0; i < data.length; i += 4) {
                let r = data[i];
                let g = data[i+1];
                let b = data[i+2];
                
                r += itemExp;
                g += itemExp;
                b += itemExp;
                
                if (itemCont !== 100) {
                   r = contFactor * (r - 128) + 128;
                   g = contFactor * (g - 128) + 128;
                   b = contFactor * (b - 128) + 128;
                }
                
                if (itemSat !== 100) {
                   const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                   r = gray + (r - gray) * satRatio;
                   g = gray + (g - gray) * satRatio;
                   b = gray + (b - gray) * satRatio;
                }
                
                if (itemGrayscale) {
                   const lum = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                   r = lum; g = lum; b = lum;
                }
                
                if (itemInvert) {
                   r = 255 - r;
                   g = 255 - g;
                   b = 255 - b;
                }
                
                if (itemThresh > 0) {
                   const lum = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                   const val = lum >= itemThresh ? 255 : 0;
                   r = val; g = val; b = val;
                }
                
                data[i] = Math.min(255, Math.max(0, r));
                data[i+1] = Math.min(255, Math.max(0, g));
                data[i+2] = Math.min(255, Math.max(0, b));
            }
            ctx.putImageData(imageData, 0, 0);
        }

        if (enableDenoise && denoiseLevel > 0) {
            let imageData = ctx.getImageData(0, 0, width, height);
            let src = imageData.data;
            const dst = new Uint8ClampedArray(src.length);
            const rArr = new Uint8Array(9);
            const gArr = new Uint8Array(9);
            const bArr = new Uint8Array(9);
            
            // Default to entire image
            let startX = 0, startY = 0, endX = width, endY = height;
            if (denoiseRect) {
                startX = Math.floor(denoiseRect.x * width);
                startY = Math.floor(denoiseRect.y * height);
                endX = startX + Math.floor(denoiseRect.w * width);
                endY = startY + Math.floor(denoiseRect.h * height);
                
                // Copy original image data to dst first so we don't lose untouched areas
                dst.set(src);
            }

            for (let iter = 0; iter < denoiseLevel; iter++) {
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        let i = 0;
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                let nx = x + dx;
                                let ny = y + dy;
                                if (nx < 0) nx = 0; else if (nx >= width) nx = width - 1;
                                if (ny < 0) ny = 0; else if (ny >= height) ny = height - 1;
                                
                                const idx = (ny * width + nx) * 4;
                                rArr[i] = src[idx];
                                gArr[i] = src[idx+1];
                                bArr[i] = src[idx+2];
                                i++;
                            }
                        }
                        rArr.sort();
                        gArr.sort();
                        bArr.sort();
                        
                        const pIdx = (y * width + x) * 4;
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
            ctx.putImageData(new ImageData(dst, width, height), 0, 0);
        }

        if (removeColor && (outputFormat === 'image/png' || outputFormat === 'image/webp')) {
           const hexToRgb = (hex: string) => {
             const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
             return result ? {
               r: parseInt(result[1], 16),
               g: parseInt(result[2], 16),
               b: parseInt(result[3], 16)
             } : { r: 255, g: 255, b: 255 };
           };
           
           const targetRgb = hexToRgb(targetColor);
           const thresholdSq = Math.pow((colorTolerance / 100) * 441.673, 2);

           const imageData = ctx.getImageData(0, 0, width, height);
           const data = imageData.data;
           for (let i = 0; i < data.length; i += 4) {
               const r = data[i];
               const g = data[i+1];
               const b = data[i+2];
               
               const distSq = Math.pow(r - targetRgb.r, 2) + Math.pow(g - targetRgb.g, 2) + Math.pow(b - targetRgb.b, 2);
               if (distSq <= thresholdSq) {
                   data[i+3] = 0; 
               }
           }
           ctx.putImageData(imageData, 0, 0);
        }

        canvas.toBlob(blob => {
          if (blob) {
            resolve({ blob, canvas });
          } else {
            reject(new Error('Blob conversion failed'));
          }
        }, outputFormat, quality);
      };

      img.onerror = () => {
        reject(new Error('Image loading failed'));
      };

      img.src = item.previewUrl;
    });
  };

  const applyOcrPreprocess = (sourceCanvas: HTMLCanvasElement, contrast: number, brightness: number, invert: boolean): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return sourceCanvas;
    
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    
    ctx.drawImage(sourceCanvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      let adjusted = (gray - 128) * contrast + 128 + brightness;
      
      adjusted = Math.min(255, Math.max(0, adjusted));
      if (invert) adjusted = 255 - adjusted;
      
      data[i] = data[i+1] = data[i+2] = adjusted;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  };

  const superScaleAndSharpen = (sourceCanvas: HTMLCanvasElement, scale: number = 3): HTMLCanvasElement => {
    // 1. 高画質な拡大 (High-Quality Upscaling)
    const scaledCanvas = document.createElement('canvas');
    const scaledWidth = Math.floor(sourceCanvas.width * scale);
    const scaledHeight = Math.floor(sourceCanvas.height * scale);
    scaledCanvas.width = scaledWidth;
    scaledCanvas.height = scaledHeight;
    
    const sCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx) return sourceCanvas;

    // スムージングを有効にし、高品質な補間を指定
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(sourceCanvas, 0, 0, scaledWidth, scaledHeight);

    // 2. シャープネス（輪郭強調）フィルターの適用
    const imageData = sCtx.getImageData(0, 0, scaledWidth, scaledHeight);
    const data = imageData.data;
    const outputData = new Uint8ClampedArray(data.length);
    
    // 畳み込み行列（シャープネス）
    // [ 0, -1,  0]
    // [-1,  5, -1]
    // [ 0, -1,  0]
    const kernel = [
       0, -1,  0,
      -1,  5, -1,
       0, -1,  0
    ];

    for (let y = 1; y < scaledHeight - 1; y++) {
      for (let x = 1; x < scaledWidth - 1; x++) {
        for (let c = 0; c < 3; c++) { // R, G, B
          let sum = 0;
          for (let ky = 0; ky < 3; ky++) {
            for (let kx = 0; kx < 3; kx++) {
              const pixelIndex = ((y + ky - 1) * scaledWidth + (x + kx - 1)) * 4 + c;
              sum += data[pixelIndex] * kernel[ky * 3 + kx];
            }
          }
          const outputIndex = (y * scaledWidth + x) * 4 + c;
          outputData[outputIndex] = Math.min(255, Math.max(0, sum));
        }
        // Alpha channel
        const alphaIndex = (y * scaledWidth + x) * 4 + 3;
        outputData[alphaIndex] = data[alphaIndex];
      }
    }

    // 縁のピクセル処理（単純コピー）
    for (let i = 0; i < data.length; i += 4) {
      if (outputData[i + 3] === 0 && data[i + 3] !== 0) {
        outputData[i] = data[i];
        outputData[i + 1] = data[i+1];
        outputData[i + 2] = data[i+2];
        outputData[i + 3] = data[i+3];
      }
    }

    sCtx.putImageData(new ImageData(outputData, scaledWidth, scaledHeight), 0, 0);
    return scaledCanvas;
  };

  const processAll = async () => {
    const selectedIds = files.filter(f => f.selected && f.status !== 'processing').map(f => f.id);
    if (selectedIds.length === 0 || isProcessing) return;
    setIsProcessing(true);

    let currentFiles = [...files];
    
    for (const targetId of selectedIds) {
        const idx = currentFiles.findIndex(f => f.id === targetId);
        if (idx === -1) continue;

        // Mark as processing
        currentFiles[idx] = { ...currentFiles[idx], status: 'processing', progress: 50 };
        setFiles([...currentFiles]);

        try {
           const { blob, canvas } = await processImageCanvas(currentFiles[idx]);
           
           let finalBlob = blob;
           let ocrResult: string | undefined = undefined;
           if (enableOcr) {
               currentFiles[idx] = { ...currentFiles[idx], status: 'processing', progress: 75 };
               setFiles([...currentFiles]);
               
               const processedCanvas = applyOcrPreprocess(canvas, ocrContrast, ocrBrightness, ocrInvert);
               const optimizedCanvas = superScaleAndSharpen(processedCanvas, ocrUpscale);
               try {
                  const worker = await Tesseract.createWorker(ocrLang);
                  await worker.setParameters({
                    tessedit_pageseg_mode: ocrLang === 'jpn_vert' ? '5' : '3',
                  });
                  const { data: { text } } = await worker.recognize(optimizedCanvas);
                  await worker.terminate();
                  ocrResult = autoRemoveSpaces ? text.replace(/[ 　]/g, '') : text;
               } catch (ocrErr) {
                  console.error("OCR Failed:", ocrErr);
               }
               
               // OCRの前処理をプレビュー（出力画像）に反映するため、Blobを生成し直す
               try {
                   finalBlob = await new Promise<Blob>((resolve, reject) => {
                       optimizedCanvas.toBlob(b => {
                           if (b) resolve(b);
                           else reject(new Error('Optimized blob generation failed'));
                       }, outputFormat, quality);
                   });
               } catch (e) {
                   console.error("Optimized blob generation error:", e);
               }
           }

           if (enableExif && outputFormat === 'image/jpeg' && (exifDateOriginal || exifDateModified)) {
               try {
                   const reader = new FileReader();
                   const base64Data = await new Promise<string>((resolve, reject) => {
                       reader.onload = e => resolve(e.target?.result as string);
                       reader.onerror = reject;
                       reader.readAsDataURL(finalBlob);
                   });
                   
                   let exifObj;
                   try {
                       exifObj = (piexif as any).load(base64Data);
                   } catch(e) {
                       exifObj = {"0th":{}, "Exif":{}, "GPS":{}, "Interop":{}, "1st":{}, "thumbnail":null};
                   }
                   
                   if (exifDateOriginal) {
                       exifObj["Exif"][(piexif as any).ExifIFD.DateTimeOriginal] = formatExifDate(exifDateOriginal);
                   }
                   if (exifDateModified) {
                       exifObj["0th"][(piexif as any).ImageIFD.DateTime] = formatExifDate(exifDateModified);
                   }
                   
                   const exifStr = (piexif as any).dump(exifObj);
                   const newJpegBase64 = (piexif as any).insert(exifStr, base64Data);
                   
                   const byteString = atob(newJpegBase64.split(',')[1]);
                   const ab = new ArrayBuffer(byteString.length);
                   const ia = new Uint8Array(ab);
                   for (let i = 0; i < byteString.length; i++) {
                       ia[i] = byteString.charCodeAt(i);
                   }
                   finalBlob = new Blob([ab], { type: 'image/jpeg' });
               } catch (e) {
                   console.warn("EXIF modification failed:", e);
               }
           }

           currentFiles[idx] = {
               ...currentFiles[idx],
               status: 'done',
               progress: 100,
               resultBlob: finalBlob,
               resultUrl: URL.createObjectURL(finalBlob),
               extractedText: ocrResult
           };
        } catch (err: any) {
           currentFiles[idx] = {
               ...currentFiles[idx],
               status: 'error',
               errorMsg: err.message
           };
        }
        setFiles([...currentFiles]);
        // Slight delay for UI update breathing room
        await new Promise(r => setTimeout(r, 50));
    }

    setIsProcessing(false);
  };

  const extMap: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp'
  };

  const generateFileName = (originalName: string, index: number, totalFiles: number, currentExt: string) => {
      let baseName = '';
      if (namingMode === 'original') {
         const nameParts = originalName.split('.');
         nameParts.pop();
         baseName = nameParts.join('.');
      } else if (namingMode === 'date_seq') {
         const date = new Date();
         const yyyy = date.getFullYear();
         const MM = String(date.getMonth() + 1).padStart(2, '0');
         const dd = String(date.getDate()).padStart(2, '0');
         const dateStr = `${yyyy}${MM}${dd}`;
         const padLen = Math.max(3, String(totalFiles).length);
         baseName = `${dateStr}_${String(index + 1).padStart(padLen, '0')}`;
      } else if (namingMode === 'custom_seq') {
         const padLen = Math.max(3, String(totalFiles).length);
         baseName = `${customPrefix || 'file'}_${String(index + 1).padStart(padLen, '0')}`;
      }
      return baseName + currentExt;
  };

  const downloadSingleFile = (fileItem: FileItem) => {
    if (!fileItem.resultBlob) return;
    const currentExt = extMap[outputFormat] || '.png';
    const selectedFiles = files.filter(f => f.selected);
    const index = selectedFiles.findIndex(f => f.id === fileItem.id);
    const newName = generateFileName(fileItem.file.name, index === -1 ? 0 : index, selectedFiles.length, currentExt);
    saveAs(fileItem.resultBlob, newName);
  };

  const downloadZip = async () => {
    const doneFiles = files.filter(f => f.selected && f.status === 'done' && f.resultBlob);
    if (doneFiles.length === 0) return;

    const zip = new JSZip();
    const currentExt = extMap[outputFormat] || '.png';
    
    const usedNames = new Set<string>();

    doneFiles.forEach((file) => {
      const selectedFiles = files.filter(f => f.selected);
      const index = selectedFiles.findIndex(f => f.id === file.id);
      
      let baseName = generateFileName(file.file.name, index === -1 ? 0 : index, selectedFiles.length, currentExt);
      let finalName = baseName;
      let counter = 1;

      while(usedNames.has(finalName)) {
           const nameParts = baseName.split('.');
           const ext = nameParts.pop();
           finalName = `${nameParts.join('.')}_${counter}.${ext}`;
           counter++;
      }
      usedNames.add(finalName);
      zip.file(finalName, file.resultBlob!);
    });

    try {
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, 'solid_processed_images.zip');
    } catch(err) {
        console.error("ZIP Generation failed", err);
    }
  };

  function formatBytes(bytes: number, decimals = 2) {
      if (!+bytes) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  const navigatePreview = (direction: 1 | -1) => {
      const currentItem = resultPreviewItem || adjustPreviewItem;
      if (!currentItem) return;
      const index = files.findIndex(f => f.id === currentItem.id);
      if (index === -1) return;
      
      const nextIndex = (index + direction + files.length) % files.length;
      const nextItem = files[nextIndex];
      
      if (resultPreviewItem) {
          if (nextItem.status === 'done' && nextItem.resultUrl) {
              setResultPreviewItem(nextItem);
          } else {
              setResultPreviewItem(null);
              setAdjustPreviewItem(nextItem);
          }
      } else if (adjustPreviewItem) {
          if (nextItem.status === 'done' && nextItem.resultUrl) {
              setAdjustPreviewItem(null);
              setResultPreviewItem(nextItem);
          } else {
              setAdjustPreviewItem(nextItem);
          }
      }
  };

  return (
    <div className="h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono flex flex-col items-center overflow-hidden selection:bg-[var(--theme-accent)] selection:text-[#0E1116] w-full relative">
      {globalMessage && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-sm text-xs shadow-lg font-bold border ${globalMessage.type === 'error' ? 'bg-[#FF3B30]/20 border-[#FF3B30] text-[#FF3B30]' : 'bg-[var(--theme-accent)]/20 border-[var(--theme-accent)] text-[var(--theme-accent)]'}`}>
           {globalMessage.text}
        </div>
      )}
      {resultPreviewItem && (
          <ResultPreviewModal
             fileItem={resultPreviewItem}
             onClose={() => setResultPreviewItem(null)}
             onNext={() => navigatePreview(1)}
             onPrev={() => navigatePreview(-1)}
             t={t}
          />
      )}
      {adjustPreviewItem && (
          <AdjustPreviewModal
             fileItem={adjustPreviewItem}
             globalAdjust={{ exposure, saturation, contrast, threshold, grayscale, invert: adjustInvert, cropRect }}
             onNext={() => navigatePreview(1)}
             onPrev={() => navigatePreview(-1)}
             onSave={(id, adjust) => {
               setFiles(prev => prev.map(f => f.id === id ? { ...f, adjust } : f));
               setAdjustPreviewItem(null);
             }}
             onSync={(adjust) => {
               setExposure(adjust.exposure);
               setSaturation(adjust.saturation);
               setContrast(adjust.contrast);
               setThreshold(adjust.threshold);
               setGrayscale(adjust.grayscale);
               setAdjustInvert(adjust.invert);
               setCropRect(adjust.cropRect);
               setFiles(prev => prev.map(f => f.selected ? { ...f, adjust } : f));
               setAdjustPreviewItem(null);
             }}
             onClose={() => setAdjustPreviewItem(null)}
             t={t}
          />
      )}
      
      {denoisePreviewItem && (
          <DenoisePreviewModal
             fileItem={denoisePreviewItem}
             denoiseLevel={denoiseLevel}
             setDenoiseLevel={setDenoiseLevel}
             denoiseRect={denoiseRect}
             setDenoiseRect={setDenoiseRect}
             onClose={() => setDenoisePreviewItem(null)}
             t={t}
          />
      )}
{inspectModalItem && (
          <EyeDropperModal
             fileItem={inspectModalItem}
             onClose={() => setInspectModalItem(null)}
             t={t}
             onColorSelect={(hex) => {
                 setTargetColor(hex);
                 setInspectModalItem(null);
                 setRemoveColor(true);
             }}
          />
      )}
      {ocrPreviewItem && (
          <OcrTunerModal
             fileItem={ocrPreviewItem}
             contrast={ocrContrast}
             brightness={ocrBrightness}
             invert={ocrInvert}
             upscale={ocrUpscale}
             setContrast={setOcrContrast}
             setBrightness={setOcrBrightness}
             setInvert={setOcrInvert}
             setUpscale={setOcrUpscale}
             onClose={() => setOcrPreviewItem(null)}
             t={t}
          />
      )}
      <div className="w-full max-w-[1400px] h-full flex flex-col p-4 md:p-6 overflow-hidden relative">
      {/* HEADER */}
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-4 h-4 bg-[var(--theme-accent)] shadow-[0_0_12px_var(--theme-accent)] rounded-sm transition-colors"></div>
          <div>
            <h1 className="font-bold tracking-[0.1em] text-base uppercase leading-none mb-1 text-[var(--text-primary)]">
              SOLID IMAGE ENGINE CONVERTER
            </h1>
            <div className="flex items-center gap-4">
                <p className="text-[var(--theme-accent)] text-[10px] tracking-widest leading-none flex gap-2 transition-colors">
                  <span>● SYSTEM V1.0.5</span>
                  <span className="opacity-50 hidden sm:inline">| {t.appSubHead}</span>
                </p>
            </div>
          </div>
        </div>
        <div className="flex gap-4 sm:gap-6 items-center">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-[10px] opacity-50 uppercase text-[var(--text-muted)]">Status / 状態</span>
            <span className="text-[11px] text-[var(--theme-accent)] uppercase font-bold tracking-widest transition-colors">READY / SANDBOX_ACTIVE</span>
          </div>

          <div className="w-[1px] h-8 bg-[var(--border-color)] hidden sm:block"></div>
          
          <div className="flex items-center gap-4">
              <div className="flex bg-[var(--bg-button)] border border-[var(--border-color)] rounded-[4px] overflow-hidden">
                  <button
                    onClick={() => setLang('en')}
                    className={`px-2.5 py-0.5 text-[10px] font-bold tracking-wider transition-colors ${lang === 'en' ? 'bg-[var(--text-primary)] text-[var(--bg-main)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => setLang('ja')}
                    className={`px-2.5 py-0.5 text-[10px] font-bold tracking-wider transition-colors ${lang === 'ja' ? 'bg-[var(--text-primary)] text-[var(--bg-main)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    JP
                  </button>
              </div>
              
              <div className="w-[1px] h-4 bg-[var(--border-color)]"></div>
              
              <button
                  onClick={() => setSidebarPosition(p => p === 'right' ? 'left' : 'right')}
                  className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-color)] bg-transparent hover:bg-[var(--bg-button)] rounded-[4px] transition-all"
                  title="Toggle Sidebar Position"
              >
                  {sidebarPosition === 'right' ? <PanelRight size={16} /> : <PanelLeft size={16} />}
              </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className={`flex-1 flex gap-6 flex-col lg:gap-0 overflow-hidden ${sidebarPosition === 'right' ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}>
        
        {/* LEFT COLUMN: DROP ZONE & LIST */}
        <div className="flex-[2.5] flex flex-col gap-6 min-w-0 h-full">
           
           <>
           {/* Drop Zone Box */}
           <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-[0_4px_12px_rgba(0,0,0,0.5)] rounded-sm flex flex-col relative shrink-0">
             <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-button)]">
                 <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                     <Layers size={14} className="text-[var(--theme-accent-sub)]" />
                     <span>INPUT DOMAIN <span className="opacity-50 font-normal ml-2">{t.dropZoneLabel}</span></span>
                 </div>
                 <div className="flex gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent-sub)]"></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)]"></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                 </div>
             </div>

             <div className="p-4 flex-shrink-0">
                <div 
                  className={`flex items-center justify-center border-2 border-dashed border-[var(--border-focus)] rounded-sm flex-col cursor-pointer hover:border-[var(--theme-accent)] hover:bg-[var(--bg-hover)] transition-colors p-6 ${files.length > 0 ? 'py-6' : 'py-16'}`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      multiple 
                      accept="image/png, image/jpeg, image/webp, image/gif, image/bmp, image/heic, image/heif, application/pdf, .heic, .heif, .exif, .pdf"
                      onChange={handleFileSelect}
                    />
                    <UploadCloud size={32} className="text-[var(--theme-accent-sub)] mb-3 group-hover:text-[var(--theme-accent)] transition-colors" />
                    <span className="text-[12px] text-[var(--text-primary)] tracking-widest mb-1 text-center font-medium">DROP FILES DIRECTORY</span>
                    <span className="text-[10px] text-[var(--text-muted)] text-center uppercase tracking-wider">{t.dropZoneText}</span>
                </div>
             </div>
           </div>

           {/* File List Box */}
           <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-[0_4px_12px_rgba(0,0,0,0.5)] rounded-sm flex flex-col flex-1 min-h-0">
             <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-button)] text-[11px] flex items-center justify-between tracking-wider">
                 <div className="flex items-center gap-3">
                   <div className="flex items-center justify-center w-6">
                     <input 
                        type="checkbox" 
                        checked={files.length > 0 && files.every(f => f.selected)} 
                        onChange={toggleSelectAll} 
                        className="accent-[var(--theme-accent)] cursor-pointer w-3.5 h-3.5 border-[var(--theme-accent-sub)]"
                     />
                   </div>
                   <span className="text-[var(--text-secondary)] font-bold">QUEUE MATRIX <span className="opacity-50 font-normal ml-2">{t.queueLabel} ({files.filter(f => f.selected).length}/{files.length})</span></span>
                 </div>
                 <div className="flex gap-4 items-center">
                    {files.length > 0 && (
                      <button onClick={clearAll} className="text-[#FF3B30] hover:text-[var(--text-primary)] transition-colors uppercase cursor-pointer text-[10px]">
                        {t.clearAll}
                      </button>
                    )}
                 </div>
             </div>
             
             <div className="flex-1 overflow-auto mini-scrollbar p-2 space-y-2">
                {files.map((fileItem, idx) => (
                  <div key={fileItem.id} className={`bg-[var(--bg-deep)] border p-3 flex flex-col gap-3 group transition-colors ${fileItem.selected ? 'border-[var(--theme-accent-sub)] shadow-[inset_0_0_8px_rgba(50,75,119,0.2)]' : 'border-[var(--border-color)]'}`}>
                      <div className="flex gap-4 items-center">
                          <div className="flex items-center justify-center w-6 flex-shrink-0">
                             <input 
                                type="checkbox" 
                                checked={fileItem.selected} 
                                onChange={(e) => { e.stopPropagation(); toggleSelect(fileItem.id); }}
                                className="accent-[var(--theme-accent)] cursor-pointer w-3.5 h-3.5"
                             />
                          </div>
                          <div className="text-[var(--theme-accent-sub)] text-[10px] font-bold w-4 flex-shrink-0">
                            {(idx + 1).toString().padStart(2, '0')}
                          </div>
                          
                          {/* Thumbnail Preview */}
                          <div 
                             onClick={() => {
                               if (fileItem.status === 'done' && fileItem.resultUrl) {
                                 setResultPreviewItem(fileItem);
                               } else {
                                 setAdjustPreviewItem(fileItem);
                               }
                             }}
                             className={`w-12 h-12 flex-shrink-0 bg-checkerboard border border-[var(--border-focus)] rounded-[2px] overflow-hidden flex items-center justify-center relative hover:border-[var(--theme-accent)] transition-colors cursor-zoom-in`}
                             title={fileItem.status === 'done' && fileItem.resultUrl ? "{t.previewEnlarged}" : "{t.previewAndAdjust}"}
                          >
                            {fileItem.status === 'done' && fileItem.resultUrl ? (
                                <img src={fileItem.resultUrl} className="max-w-full max-h-full object-contain" alt="Result" />
                            ) : (
                                <img 
                                  src={fileItem.previewUrl} 
                                  className="max-w-full max-h-full object-contain transition-all" 
                                  alt="Preview"
                                  style={{
                                    filter: (() => {
                                      const a = fileItem.adjust || { exposure, saturation, contrast, threshold, grayscale, invert: adjustInvert };
                                      const filters = [];
                                      if (a.grayscale) filters.push('grayscale(100%)');
                                      if (a.invert) filters.push('invert(100%)');
                                      if (a.exposure !== 0) filters.push(`brightness(${100 + a.exposure}%)`);
                                      if (a.contrast !== 100) filters.push(`contrast(${a.contrast}%)`);
                                      if (a.saturation !== 100) filters.push(`saturate(${a.saturation}%)`);
                                      return filters.join(' ');
                                    })()
                                  }}
                                />
                            )}
                            {fileItem.status === 'processing' && (
                                <div className="absolute inset-0 bg-[var(--bg-overlay)] flex items-center justify-center">
                                   <div className="w-4 h-4 border-2 border-transparent border-t-[var(--theme-accent)] rounded-full animate-spin"></div>
                                </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                             <div className="flex items-baseline justify-between mb-1">
                                <p className="text-[var(--text-primary)] text-xs truncate max-w-[200px] sm:max-w-xs" title={fileItem.file.name}>
                                   {namingMode !== 'original' && fileItem.selected ? (
                                       <span className="text-[var(--theme-accent)]">
                                         {generateFileName(
                                           fileItem.file.name, 
                                           files.filter(f => f.selected).findIndex(f => f.id === fileItem.id), 
                                           files.filter(f => f.selected).length, 
                                           extMap[outputFormat] || '.png'
                                         )}
                                       </span>
                                   ) : (
                                       fileItem.file.name
                                   )}
                                </p>
                                <span className="font-mono text-[9px] text-[var(--text-muted)] flex-shrink-0 ml-2">
                                   {formatBytes(fileItem.file.size)} {fileItem.resultBlob && <span className="text-[var(--theme-accent)]">→ {formatBytes(fileItem.resultBlob.size)}</span>}
                                </span>
                             </div>
                             <div className="w-full bg-[var(--bg-button)] h-1.5 rounded-full overflow-hidden relative">
                               <div 
                                  className={`absolute top-0 left-0 h-full transition-all duration-300 ${
                                    fileItem.status === 'done' ? 'bg-[var(--theme-accent)] shadow-[0_0_8px_rgba(var(--theme-accent-rgb),0.5)]' :
                                    fileItem.status === 'error' ? 'bg-[#FF3B30]' : 'bg-[var(--theme-accent-sub)]'
                                  }`}
                                  style={{ width: `${fileItem.progress}%` }}
                               ></div>
                             </div>
                          </div>

                          <div className="flex items-center justify-end gap-3 w-20">
                             {fileItem.status === 'done' && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); resetFileState(fileItem.id); }}
                                  className="text-[var(--text-muted)] hover:text-[var(--theme-accent)] transition-colors"
                                  title={t.resetState}
                                >
                                  <RotateCcw size={16} />
                                </button>
                             )}
                             {fileItem.status === 'done' && fileItem.resultBlob && (
                                <button 
                                  onClick={() => downloadSingleFile(fileItem)}
                                  className="text-[var(--theme-accent)] hover:text-[var(--text-primary)] transition-colors title='Download Single'"
                                  title={t.saveImage}
                                >
                                  <Download size={16} />
                                </button>
                             )}
                             <button 
                               onClick={(e) => { e.stopPropagation(); removeFile(fileItem.id); }}
                               className="text-[var(--text-muted)] hover:text-[#FF3B30] transition-colors"
                               title={t.removeFromList}
                             >
                               <Trash2 size={16} />
                             </button>
                          </div>
                      </div>

                      {/* OCR RESULT */}
                      {fileItem.status === 'done' && fileItem.extractedText !== undefined && (
                          <div className="ml-10 min-w-0 mt-0 bg-[var(--bg-button)] border border-[var(--border-focus)] rounded-[2px] p-2 relative flex flex-col gap-2">
                               <div className="flex justify-between items-center flex-wrap gap-2">
                                   <div className="flex items-center gap-4">
                                       <span className="text-[9px] text-[var(--theme-accent)] font-bold uppercase tracking-widest pl-1">OCR Result</span>
                                       <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                           <span className="text-[9px] text-[var(--text-muted)]">FONT SIZE</span>
                                           <input 
                                             type="range" min="8" max="32" step="1" 
                                             value={ocrFontSize} 
                                             onChange={(e) => setOcrFontSize(Number(e.target.value))}
                                             className="w-16 md:w-24 appearance-none bg-[var(--text-muted)] h-[5px] rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full"
                                           />
                                       </div>
                                   </div>
                                   <div className="flex gap-2">
                                       <button 
                                         onClick={(e) => {
                                            e.stopPropagation();
                                            removeSpacesFromFile(fileItem.id);
                                          }}
                                         className="text-[9px] text-[var(--text-secondary)] hover:text-[var(--theme-accent)] transition-colors flex gap-1 items-center bg-[var(--bg-hover)] px-2 py-1 rounded-[2px]"
                                       >
                                          RM SPACES
                                       </button>
                                       <button 
                                         onClick={(e) => {
                                            e.stopPropagation();
                                            if (fileItem.extractedText) {
                                                navigator.clipboard.writeText(fileItem.extractedText);
                                                setGlobalMessage({ type: 'info', text: t.copySuccess });
                                                setTimeout(() => setGlobalMessage(null), 3000);
                                            }
                                         }}
                                         className="text-[9px] text-[var(--text-secondary)] hover:text-[var(--theme-accent)] transition-colors flex gap-1 items-center bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] px-2 py-1 rounded-[2px]"
                                       >
                                          COPY
                                       </button>
                                   </div>
                               </div>
                                <textarea 
                                  readOnly 
                                  value={fileItem.extractedText} 
                                  style={{ fontSize: `${ocrFontSize}px` }}
                                  className="w-full bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-[2px] text-[var(--text-primary)] p-3 focus:outline-none min-h-[260px] resize-y leading-relaxed custom-scrollbar"
                               />
                          </div>
                      )}
                  </div>
                ))}
                {files.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                     <span className="text-[var(--text-muted)] text-[10px] tracking-widest uppercase">{t.emptyQueue}</span>
                  </div>
                )}
             </div>
           </div>
           </>
        </div>

        {/* RESIZER */}
        <div 
            className="hidden lg:flex w-6 cursor-col-resize justify-center items-center group z-10 shrink-0"
            onMouseDown={handleResizeMouseDown}
        >
            <div className={`w-[2px] h-12 bg-[var(--border-color)] group-hover:bg-[var(--theme-accent)] transition-colors ${isResizing ? 'bg-[var(--theme-accent)]' : ''}`}></div>
        </div>

        {/* RIGHT COLUMN: CONTROLS */}
        <aside 
            className="w-full lg:w-[var(--sidebar-width)] bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex flex-col shrink-0 rounded-sm"
            style={{ '--sidebar-width': `${sidebarWidth}px` } as any}
        >
            <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-button)] flex items-center gap-2 shrink-0">
                <Settings size={14} className="text-[var(--theme-accent)]" />
                <div className="text-[11px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">CONTROL_SURFACE <span className="opacity-50 font-normal">{t.settingsPanel}</span></div>
            </div>

            {/* TABS */}
            <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-deep)] shrink-0 flex-wrap">
                <button 
                  onClick={() => setActiveTab('convert')} 
                  className={`flex-1 py-3 px-2 text-[10px] font-bold tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeTab === 'convert' ? 'text-[var(--theme-accent)] border-[var(--theme-accent)] bg-[var(--bg-button)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  CONVERT
                </button>
                <button 
                  onClick={() => setActiveTab('text_scan')} 
                  className={`flex-1 py-3 px-2 text-[10px] font-bold tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeTab === 'text_scan' ? 'text-[var(--theme-accent)] border-[var(--theme-accent)] bg-[var(--bg-button)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  TEXT SCAN
                </button>
                <button 
                  onClick={() => setActiveTab('rename')} 
                  className={`flex-1 py-3 px-2 text-[10px] font-bold tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeTab === 'rename' ? 'text-[var(--theme-accent)] border-[var(--theme-accent)] bg-[var(--bg-button)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  RENAME
                </button>
                <button 
                  onClick={() => setActiveTab('metadata')} 
                  className={`flex-1 py-3 px-2 text-[10px] font-bold tracking-widest transition-colors border-b-2 whitespace-nowrap ${activeTab === 'metadata' ? 'text-[var(--theme-accent)] border-[var(--theme-accent)] bg-[var(--bg-button)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  METADATA
                </button>
            </div>
            
            <div className="p-5 flex flex-col gap-8 overflow-y-auto mini-scrollbar flex-1">
                {activeTab === 'convert' && (
                <div className="space-y-4">
                    {/* Format Selection Accordion */}
                    <details open={accFormat} onToggle={(e: any) => setAccFormat(e.target.open)} className="group bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm">
                        <summary className="p-3 bg-[var(--bg-deep)] border-b border-[var(--border-color)] cursor-pointer list-none [&::-webkit-details-marker]:hidden flex justify-between items-center text-[10px] tracking-widest text-[var(--text-secondary)] group-open:text-[var(--theme-accent)] transition-colors hover:bg-[var(--bg-hover)]">
                            <div className="flex items-baseline">
                                <span className="uppercase font-bold">01. FORMAT</span>
                                <span className="text-[9px] opacity-70 font-normal ml-3">{t.outputFormat}</span>
                            </div>
                            <ChevronLeft size={14} className="group-open:-rotate-90 transition-transform text-[var(--text-muted)] group-open:text-[var(--theme-accent)]" />
                        </summary>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                {['image/png', 'image/jpeg', 'image/webp'].map(fmt => {
                                    const isSelected = outputFormat === fmt;
                                    const label = fmt.split('/')[1].toUpperCase();
                                    return (
                                        <button 
                                            key={fmt}
                                            onClick={() => setOutputFormat(fmt)}
                                            className={`py-2 text-[11px] tracking-wider transition-all rounded-sm border ${isSelected ? 'bg-[var(--theme-accent-sub)]/20 border-[var(--theme-accent)] text-[var(--theme-accent)] shadow-[inset_0_0_8px_rgba(var(--theme-accent-rgb),0.2)]' : 'bg-[var(--bg-deep)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--theme-accent-sub)]'}`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            {outputFormat === 'image/png' && (
                                <p className="text-[9px] text-[var(--theme-accent-sub)] mt-1">{t.alphaKeepNotice}</p>
                            )}
                        </div>
                    </details>

                    {/* Compression Accordion */}
                    <details open={accCompress} onToggle={(e: any) => setAccCompress(e.target.open)} className={`group bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm transition-opacity duration-300 ${outputFormat === 'image/png' ? 'opacity-40' : ''}`}>
                        <summary className="p-3 bg-[var(--bg-deep)] border-b border-[var(--border-color)] cursor-pointer list-none [&::-webkit-details-marker]:hidden flex justify-between items-center text-[10px] tracking-widest text-[var(--text-secondary)] group-open:text-[var(--theme-accent)] transition-colors hover:bg-[var(--bg-hover)]">
                            <div className="flex items-baseline">
                                <span className="uppercase font-bold">02. COMPRESSION</span>
                                <span className="text-[9px] opacity-70 font-normal ml-3">{t.imageCompress}</span>
                            </div>
                            <ChevronLeft size={14} className="group-open:-rotate-90 transition-transform text-[var(--text-muted)] group-open:text-[var(--theme-accent)]" />
                        </summary>
                        <div className={`p-4 space-y-3 ${outputFormat === 'image/png' ? 'pointer-events-none' : ''}`}>
                            <div className="flex items-baseline justify-between">
                                <span className="text-[9px] text-[var(--text-secondary)] tracking-wider uppercase">{t.qualityLevel}</span>
                                <span className="text-[12px] text-[var(--theme-accent)] font-bold">{Math.round(quality * 100)}%</span>
                            </div>
                            <div className="relative pt-2 pb-2">
                               <input 
                                  type="range" 
                                  min="0.1" 
                                  max="1" 
                                  step="0.05"
                                  value={quality}
                                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                                  className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full"
                               />
                               <div 
                                 className="absolute top-[8px] left-0 h-1 bg-[var(--theme-accent)] pointer-events-none" 
                                 style={{ width: `${quality * 100}%` }}
                               ></div>
                            </div>
                            {outputFormat === 'image/png' && (
                                <p className="text-[9px] text-[#E53E3E] mt-1">{t.pngNoCompressNotice}</p>
                            )}
                        </div>
                    </details>

                    {/* Adjust & Crop Accordion */}
                    <details open={accAdjust} onToggle={(e: any) => setAccAdjust(e.target.open)} className="group bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm">
                        <summary className="p-3 bg-[var(--bg-deep)] border-b border-[var(--border-color)] cursor-pointer list-none [&::-webkit-details-marker]:hidden flex justify-between items-center text-[10px] tracking-widest text-[var(--text-secondary)] group-open:text-[var(--theme-accent)] transition-colors hover:bg-[var(--bg-hover)]">
                            <div className="flex items-baseline">
                                <span className="uppercase font-bold">03. ADJUST & CROP</span>
                                <span className="ml-3 opacity-50 hidden sm:inline">{t.adjustHeader}</span>
                            </div>
                            <ChevronLeft size={14} className="group-open:-rotate-90 transition-transform text-[var(--text-muted)] group-open:text-[var(--theme-accent)]" />
                        </summary>
                        <div className="p-4 space-y-4 text-center">
                            {files.length > 0 ? (
                                <>
                                  <div className="text-[10px] text-[var(--text-secondary)] mb-2 flex justify-center gap-4">
                                     <span>{t.expInfo} <span className="text-[var(--theme-accent)]">{exposure}</span></span>
                                     <span>{t.satInfo} <span className="text-[var(--theme-accent)]">{saturation}%</span></span>
                                     <span>{t.cropInfo} <span className="text-[var(--theme-accent)]">{cropRect ? '設定済' : 'OFF'}</span></span>
                                  </div>
                                  <button
                                    onClick={() => {
                                       const targetFile = files.find(f => f.selected) || files[0];
                                       if (targetFile) setAdjustPreviewItem(targetFile);
                                    }}
                                    className="w-full mt-2 bg-[var(--bg-button)] hover:bg-[var(--theme-accent-sub)] text-[var(--theme-accent)] hover:text-[var(--text-primary)] px-3 py-4 rounded-sm text-[11px] font-bold transition-colors tracking-widest border border-[var(--theme-accent-sub)] hover:border-[var(--theme-accent)]"
                                  >
                                    OPEN VISUAL EDITOR
                                  </button>
                                </>
                            ) : (
                                <p className="text-[10px] opacity-50 uppercase text-[var(--text-muted)]">FILE REQUIRED</p>
                            )}
                        </div>
                    </details>

                    {/* Resize Matrix Accordion */}
                    <details open={accResize} onToggle={(e: any) => setAccResize(e.target.open)} className="group bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm">
                        <summary className="p-3 bg-[var(--bg-deep)] border-b border-[var(--border-color)] cursor-pointer list-none [&::-webkit-details-marker]:hidden flex justify-between items-center text-[10px] tracking-widest text-[var(--text-secondary)] group-open:text-[var(--theme-accent)] transition-colors hover:bg-[var(--bg-hover)]">
                            <div className="flex items-center">
                                <span className="uppercase font-bold">04. RESIZE</span>
                                <span className="text-[9px] opacity-70 font-normal ml-3 hidden sm:inline">{t.resizeHeader}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                {resizeMode !== 'none' && (
                                    <button 
                                        onClick={(e) => { 
                                            e.preventDefault(); 
                                            setResizeMode('none'); 
                                            setScaleFactor(1.0); 
                                            setExactWidth(1920); 
                                            setExactHeight(1080); 
                                        }} 
                                        className="text-[var(--theme-accent)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center bg-[var(--theme-accent-sub)]/30 p-1.5 rounded-sm"
                                        title="リセット"
                                    >
                                        <RotateCcw size={12} />
                                    </button>
                                )}
                                <ChevronLeft size={14} className="group-open:-rotate-90 transition-transform text-[var(--text-muted)] group-open:text-[var(--theme-accent)]" />
                            </div>
                        </summary>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                  { id: 'none', label: t.resizeNone },
                                  { id: 'scale', label: t.resizeScale },
                                  { id: 'exact', label: t.resizeExact }
                                ].map(mode => (
                                    <button 
                                        key={mode.id}
                                        onClick={() => setResizeMode(mode.id as any)}
                                        className={`py-1.5 text-[10px] tracking-wider transition-all rounded-sm border ${resizeMode === mode.id ? 'bg-[var(--theme-accent-sub)]/20 border-[var(--theme-accent)] text-[var(--theme-accent)]' : 'bg-[var(--bg-deep)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--theme-accent-sub)]'}`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>

                            {resizeMode === 'scale' && (
                                <div className="space-y-2 bg-[var(--bg-deep)] border border-[var(--border-color)] p-3 rounded-sm">
                                    <div className="flex justify-between items-end">
                                        <span className="text-[9px] text-[var(--text-secondary)] tracking-wider uppercase">{t.multiplier}</span>
                                        <span className="text-[12px] text-[var(--theme-accent)] font-bold">x{scaleFactor.toFixed(1)}</span>
                                    </div>
                                    <div className="relative pt-2 pb-2">
                                       <input 
                                          type="range" min="0.1" max="3" step="0.1" value={scaleFactor}
                                          onChange={(e) => setScaleFactor(parseFloat(e.target.value))}
                                          className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full"
                                       />
                                    </div>
                                </div>
                            )}
                            
                            {resizeMode === 'exact' && (
                                 <div className="flex items-center gap-2 bg-[var(--bg-deep)] border border-[var(--border-color)] p-3 rounded-sm">
                                    <div className="flex-1">
                                       <span className="text-[9px] text-[var(--text-muted)] block mb-1">{t.widthLabel}</span>
                                       <input 
                                         type="number" value={exactWidth} onChange={e => setExactWidth(Number(e.target.value))}
                                         className="bg-[var(--bg-button)] border border-[var(--border-focus)] w-full p-2 text-xs text-[var(--theme-accent)] font-bold focus:outline-none focus:border-[var(--theme-accent-sub)] transition-colors text-center rounded-sm"
                                       />
                                    </div>
                                    <span className="text-[10px] text-[var(--text-muted)] leading-none mt-4">×</span>
                                    <div className="flex-1">
                                       <span className="text-[9px] text-[var(--text-muted)] block mb-1">{t.heightLabel}</span>
                                       <input 
                                         type="number" value={exactHeight} onChange={e => setExactHeight(Number(e.target.value))}
                                         className="bg-[var(--bg-button)] border border-[var(--border-focus)] w-full p-2 text-xs text-[var(--theme-accent)] font-bold focus:outline-none focus:border-[var(--theme-accent-sub)] transition-colors text-center rounded-sm"
                                       />
                                    </div>
                                </div>
                            )}
                            {resizeMode !== 'none' && (
                                <p className="text-[9px] text-[var(--theme-accent-sub)] mt-1 text-right">{t.resizeIgnoreAspectNotice}</p>
                            )}
                        </div>
                    </details>
                    
                    {/* Effects Accordion */}
                    <details open={accEffects} onToggle={(e: any) => setAccEffects(e.target.open)} className="group bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-sm">
                        <summary className="p-3 bg-[var(--bg-deep)] border-b border-[var(--border-color)] cursor-pointer list-none [&::-webkit-details-marker]:hidden flex justify-between items-center text-[10px] tracking-widest text-[var(--text-secondary)] group-open:text-[var(--theme-accent)] transition-colors hover:bg-[var(--bg-hover)]">
                            <div className="flex items-baseline">
                                <span className="uppercase font-bold">05. EFFECTS</span>
                                <span className="text-[9px] opacity-70 font-normal ml-3">{t.effectsHeader}</span>
                            </div>
                            <ChevronLeft size={14} className="group-open:-rotate-90 transition-transform text-[var(--text-muted)] group-open:text-[var(--theme-accent)]" />
                        </summary>
                        <div className="p-4 space-y-3">
                            <div className={`bg-[var(--bg-deep)] border p-3 rounded-sm flex flex-col transition-colors ${outputFormat === 'image/jpeg' ? 'border-[var(--border-color)] opacity-50' : (removeColor ? 'border-[var(--theme-accent)] shadow-[inset_0_0_8px_rgba(var(--theme-accent-rgb),0.1)]' : 'border-[var(--border-color)] hover:border-[var(--theme-accent-sub)]')}`}>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input 
                                      type="checkbox" disabled={outputFormat === 'image/jpeg'} checked={removeColor}
                                      onChange={(e) => {
                                         setRemoveColor(e.target.checked);
                                         if (e.target.checked) setEnableOcr(false);
                                      }}
                                      className="accent-[var(--theme-accent)] cursor-pointer w-4 h-4"
                                    />
                                    <div className="flex flex-col">
                                       <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-wider uppercase">REMOVE SPECIFIC COLOR</span>
                                       <span className="text-[9px] text-[var(--text-muted)]">{t.transparencySetting}</span>
                                    </div>
                                </label>
                                
                                {removeColor && (
                                    <div className="pt-4 mt-3 border-t border-[var(--border-color)] space-y-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-[9px] text-[var(--text-muted)] block mb-1">{t.targetColor}</span>
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="color" value={targetColor} onChange={(e) => setTargetColor(e.target.value)}
                                                        className="w-8 h-8 p-0 border-0 bg-transparent rounded-sm cursor-pointer shrink-0 [&::-webkit-color-swatch]:border [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-[var(--border-focus)] [&::-webkit-color-swatch]:rounded-sm"
                                                        title={t.colorPickerTitle}
                                                    />
                                                    <input 
                                                        type="text" value={targetColor} onChange={(e) => setTargetColor(e.target.value.toUpperCase())}
                                                        className="bg-[var(--bg-button)] border border-[var(--border-focus)] w-20 p-1.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--theme-accent-sub)] transition-colors rounded-sm min-w-0"
                                                    />
                                                    {files.length > 0 && (
                                                        <button
                                                          onClick={() => {
                                                             const targetFile = files.find(f => f.selected) || files[0];
                                                             if (targetFile) setInspectModalItem(targetFile);
                                                          }}
                                                          className="bg-[var(--bg-hover)] hover:bg-[var(--theme-accent-sub)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1.5 rounded-sm text-[10px] transition-colors tracking-wider shrink-0"
                                                        >
                                                          {t.extractFromImage}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.tolerance}</span>
                                                <span className="text-[12px] text-[var(--theme-accent)] font-bold">{colorTolerance}</span>
                                            </div>
                                            <div className="relative pt-2 pb-2">
                                               <input 
                                                  type="range" min="0" max="100" step="1" value={colorTolerance}
                                                  onChange={(e) => setColorTolerance(Number(e.target.value))}
                                                  className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full"
                                               />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={`bg-[var(--bg-deep)] border p-3 rounded-sm flex flex-col transition-colors ${enableDenoise ? 'border-[var(--theme-accent)] shadow-[inset_0_0_8px_rgba(var(--theme-accent-rgb),0.1)]' : 'border-[var(--border-color)] hover:border-[var(--theme-accent-sub)]'}`}>
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input 
                                      type="checkbox" checked={enableDenoise}
                                      onChange={(e) => setEnableDenoise(e.target.checked)}
                                      className="accent-[var(--theme-accent)] cursor-pointer w-4 h-4 mt-0.5"
                                    />
                                    <div className="flex flex-col">
                                       <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-wider uppercase">{t.denoiseLabel}</span>
                                       <span className="text-[9px] text-[var(--text-muted)] mt-0.5">{t.denoiseSetting}</span>
                                       <span className="text-[8.5px] text-[var(--theme-accent)] mt-1 opacity-75">{t.denoiseNotice}</span>
                                    </div>
                                </label>

                                {enableDenoise && (
                                    <div className="pt-4 mt-4 border-t border-[var(--border-color)] space-y-4 ml-7">
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">ITERATIONS (STRENGTH)</span>
                                                <span className="text-[10px] text-[var(--theme-accent)]">{denoiseLevel}</span>
                                            </div>
                                            <input type="range" min="1" max="5" step="1" value={denoiseLevel} onChange={e => setDenoiseLevel(Number(e.target.value))} className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full" />
                                        </div>
                                        <button 
                                          onClick={() => {
                                             const targetFile = files.find(f => f.selected) || files[0];
                                             if (targetFile) setDenoisePreviewItem(targetFile);
                                          }}
                                          className="w-full bg-[var(--bg-button)] hover:bg-[var(--theme-accent-sub)] text-[var(--theme-accent)] hover:text-[var(--text-primary)] px-3 py-2 rounded-sm text-[10px] font-bold transition-colors tracking-widest border border-[var(--theme-accent-sub)] hover:border-[var(--theme-accent)]"
                                        >
                                          OPEN PREVIEW
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </details>
                </div>
                )}

                {activeTab === 'text_scan' && (
                <>
                {/* 06. Text Extract (OCR) */}
                <div className="space-y-3">
                    <label className="text-[10px] text-[var(--text-muted)] block tracking-widest flex items-baseline justify-between">
                        <span className="uppercase font-bold">01. TEXT EXTRACT</span>
                        <span className="opacity-70 font-normal">{t.ocrHeader}</span>
                    </label>
                    <div className={`bg-[var(--bg-deep)] border p-3 rounded-sm flex flex-col transition-colors ${enableOcr ? 'border-[var(--theme-accent)] shadow-[inset_0_0_8px_rgba(var(--theme-accent-rgb),0.1)]' : 'border-[var(--border-color)] hover:border-[var(--theme-accent-sub)]'}`}>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={enableOcr}
                              onChange={(e) => {
                                setEnableOcr(e.target.checked);
                                if (e.target.checked) setRemoveColor(false);
                              }}
                              className="accent-[var(--theme-accent)] cursor-pointer w-4 h-4"
                            />
                            <div className="flex flex-col">
                               <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-wider uppercase">ENABLE OCR</span>
                               <span className="text-[9px] text-[var(--text-muted)]">{t.ocrEnable}</span>
                            </div>
                        </label>
                        
                        {enableOcr && (
                            <div className="pt-3 mt-3 border-t border-[var(--border-color)] space-y-4">
                               <div>
                                   <span className="text-[9px] text-[var(--text-muted)] block mb-1">{t.language}</span>
                                   <div className="grid grid-cols-2 gap-2">
                                       {[
                                         { id: 'eng', label: t.langEn },
                                         { id: 'jpn', label: t.langJa },
                                         { id: 'jpn_vert', label: t.langJaVert },
                                         { id: 'eng+jpn', label: t.langEnJa }
                                       ].map(lang => (
                                           <button 
                                             key={lang.id}
                                             onClick={() => setOcrLang(lang.id as any)}
                                             className={`py-1.5 text-[10px] tracking-wider transition-all rounded-sm border ${ocrLang === lang.id ? 'bg-[var(--theme-accent-sub)]/20 border-[var(--theme-accent)] text-[var(--theme-accent)]' : 'bg-[var(--bg-button)] border-[var(--border-focus)] text-[var(--text-secondary)] hover:border-[var(--theme-accent-sub)]'}`}
                                           >
                                               {lang.label}
                                           </button>
                                       ))}
                                   </div>
                               </div>

                               <div className="space-y-2">
                                   <div className="flex justify-between items-end">
                                       <span className="text-[9px] text-[var(--text-muted)] tracking-wider uppercase">{t.upscaleOcr}</span>
                                       <span className="text-[12px] text-[var(--theme-accent)] font-bold">{ocrUpscale.toFixed(1)}x</span>
                                   </div>
                                   <div className="relative pt-2 pb-2">
                                      <input 
                                         type="range" min="1.0" max="4.0" step="0.5" value={ocrUpscale}
                                         onChange={(e) => setOcrUpscale(Number(e.target.value))}
                                         className="w-full appearance-none bg-[var(--bg-input)] h-1 outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--theme-accent)] cursor-pointer [&::-webkit-slider-thumb]:rounded-full"
                                      />
                                   </div>
                                   <p className="text-[8px] text-[var(--text-muted)] leading-tight">{t.upscaleOcrNotice}</p>
                               </div>

                               <label className={`flex items-center gap-3 cursor-pointer p-2 rounded-sm border transition-colors ${autoRemoveSpaces ? 'bg-[var(--theme-accent-sub)]/10 border-[var(--theme-accent-sub)] text-[var(--theme-accent)]' : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--border-focus)]'}`}>
                                   <input 
                                     type="checkbox" 
                                     checked={autoRemoveSpaces}
                                     onChange={(e) => setAutoRemoveSpaces(e.target.checked)}
                                     className="accent-[var(--theme-accent)] cursor-pointer w-3.5 h-3.5"
                                   />
                                   <div className="flex flex-col">
                                      <span className="text-[10px] font-bold tracking-wider uppercase leading-none">AUTO REMOVE SPACES</span>
                                      <span className="text-[8px] opacity-70 mt-0.5">{t.removeSpaces}</span>
                                   </div>
                               </label>
                               
                               <div className="flex items-center justify-between border border-[var(--border-focus)] p-3 rounded-sm bg-[var(--bg-button)]">
                                   <div className="text-[10px] text-[var(--text-secondary)] leading-tight">
                                      {t.ocrTuningNotice1}
                                   </div>
                                   {files.length > 0 && (
                                       <button
                                         onClick={() => {
                                            const targetFile = files.find(f => f.selected) || files[0];
                                            if (targetFile) setOcrPreviewItem(targetFile);
                                         }}
                                         className="ml-2 bg-[var(--theme-accent-sub)] hover:bg-[var(--theme-accent)] text-[var(--text-primary)] hover:text-[var(--text-inverse)] px-3 py-1.5 rounded-sm text-[10px] font-bold transition-colors tracking-wider whitespace-nowrap shadow-[0_0_10px_rgba(var(--theme-accent-rgb),0.2)]"
                                       >
                                         TUNE PREVIEW
                                       </button>
                                   )}
                               </div>
                               
                               <p className="text-[9px] text-[var(--theme-accent-sub)] leading-tight">{t.ocrTuningNotice2}</p>
                            </div>
                        )}
                    </div>
                </div>
                </>
                )}

                {activeTab === 'rename' && (
                <>
                {/* Naming Rules */}
                <div className="space-y-3">
                    <label className="text-[10px] text-[var(--text-muted)] block tracking-widest flex items-baseline justify-between">
                        <span className="uppercase font-bold">01. NAMING</span>
                        <span className="opacity-70 font-normal">{t.renameHeader}</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'original', label: t.renameOriginal },
                          { id: 'date_seq', label: t.renameDateSeq },
                          { id: 'custom_seq', label: t.renameCustomSeq }
                        ].map(mode => (
                            <button 
                                key={mode.id}
                                onClick={() => setNamingMode(mode.id as any)}
                                className={`py-1.5 text-[10px] tracking-wider transition-all rounded-sm border ${namingMode === mode.id ? 'bg-[var(--theme-accent-sub)]/20 border-[var(--theme-accent)] text-[var(--theme-accent)]' : 'bg-[var(--bg-deep)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--theme-accent-sub)]'}`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                    {namingMode === 'custom_seq' && (
                        <div className="bg-[var(--bg-deep)] border border-[var(--border-color)] p-3 rounded-sm flex items-center gap-2">
                             <span className="text-[9px] text-[var(--text-muted)] truncate flex-shrink-0 font-bold uppercase">Prefix:</span>
                             <input 
                               type="text" 
                               value={customPrefix}
                               onChange={e => setCustomPrefix(e.target.value)}
                               className="bg-[var(--bg-button)] border border-[var(--border-focus)] w-full p-1.5 text-xs text-[var(--theme-accent)] font-bold focus:outline-none focus:border-[var(--theme-accent-sub)] transition-colors rounded-sm"
                               placeholder="image"
                             />
                        </div>
                    )}
                </div>
                </>
                )}

                {activeTab === 'metadata' && (
                <div className="space-y-4">
                     <label className="text-[10px] text-[var(--text-muted)] block tracking-widest flex items-baseline justify-between mb-4">
                        <span className="uppercase font-bold">EXIF DATES</span>
                        <span className="opacity-70 font-normal">Modify image timestamps</span>
                    </label>

                    <div className="bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-sm p-4 space-y-4">
                        <div className="text-[10px] text-[var(--text-muted)] mb-2">
                           EXIF modification requires output format to be JPEG.
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                           <input type="checkbox" checked={enableExif} onChange={e => {
                               setEnableExif(e.target.checked);
                               if (e.target.checked && outputFormat !== 'image/jpeg') setOutputFormat('image/jpeg');
                           }} className="accent-[var(--theme-accent)] w-3 h-3" />
                           <span className="text-[10px] text-[var(--text-primary)] font-bold tracking-wider">ENABLE EXIF DATES</span>
                        </label>
                        
                        <div className={`space-y-3 transition-opacity ${enableExif ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <div className="bg-[var(--bg-button)] border border-[var(--border-focus)] p-3 rounded-sm space-y-2">
                                <label className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] font-bold tracking-widest uppercase">
                                    <span>Date Created (Original)</span>
                                </label>
                                <input 
                                   type="datetime-local" 
                                   step="1"
                                   value={exifDateOriginal}
                                   onChange={e => setExifDateOriginal(e.target.value)}
                                   className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs p-1.5 focus:border-[var(--theme-accent-sub)] focus:outline-none"
                                />
                                <div className="text-[9px] text-[var(--text-muted)] mt-1">Leave empty to keep original</div>
                            </div>

                            <div className="bg-[var(--bg-button)] border border-[var(--border-focus)] p-3 rounded-sm space-y-2">
                                <label className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] font-bold tracking-widest uppercase">
                                    <span>Date Modified (Digitized)</span>
                                </label>
                                <input 
                                   type="datetime-local" 
                                   step="1"
                                   value={exifDateModified}
                                   onChange={e => setExifDateModified(e.target.value)}
                                   className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs p-1.5 focus:border-[var(--theme-accent-sub)] focus:outline-none"
                                />
                                <div className="text-[9px] text-[var(--text-muted)] mt-1">Leave empty to keep original</div>
                            </div>
                        </div>
                    </div>
                </div>
                )}

                <div className="text-[9px] text-[var(--text-muted)] leading-tight space-y-1">
                  <p>{t.gifWarning}</p>
                  <p>{t.localProcessWarning}</p>
                </div>
            </div>

            {/* Actions Block */}
            <div className="mt-auto p-4 border-t border-[var(--border-color)] space-y-3 bg-[var(--bg-deep)]">
                   <>
                       {files.some(f => f.selected && f.status === 'done') && (
                          <button 
                             onClick={resetSelected}
                             className="w-full bg-[var(--bg-button)] hover:bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold py-2 text-[10px] tracking-widest border border-[var(--border-focus)] rounded-sm transition-all flex justify-center items-center gap-2"
                          >
                             <RotateCcw size={12} />
                             <span>RESET SELECTED STATES</span>
                          </button>
                       )}
                       <button 
                          onClick={processAll}
                          disabled={files.filter(f => f.selected).length === 0 || isProcessing}
                          className="w-full bg-gradient-to-b from-[var(--theme-accent-sub)] to-[var(--theme-accent-dark)] hover:from-[var(--theme-accent)] hover:to-[var(--theme-accent-dark)] disabled:from-[var(--bg-button)] disabled:to-[var(--bg-panel)] disabled:text-[var(--text-muted)] text-[var(--text-primary)] font-bold py-4 text-xs tracking-[0.1em] border border-[var(--theme-accent-sub)] disabled:border-[var(--border-color)] rounded-sm transition-all flex flex-col items-center shadow-[0_4px_12px_rgba(0,0,0,0.3)] disabled:shadow-none"
                       >
                           <span className="uppercase text-[13px]">{isProcessing ? 'PROCESSING_ACTIVE...' : `EXECUTE_BATCH (${files.filter(f => f.selected).length})`}</span>
                           <span className="text-[9px] opacity-70 mt-0.5 tracking-wider font-normal">{t.startProcessing}</span>
                       </button>

                       <button 
                          onClick={downloadZip}
                          disabled={files.filter(f => f.selected && f.status === 'done').length < 2}
                          className="w-full bg-[var(--bg-button)] border border-[var(--border-color)] text-[var(--text-secondary)] py-3 text-[10px] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:hover:bg-[var(--bg-button)] disabled:cursor-not-allowed uppercase transition-all rounded-sm flex flex-col items-center"
                       >
                           <span className="tracking-widest">DOWNLOAD_ZIP_ARCHIVE</span>
                           <span className="text-[8px] opacity-50 mt-1">{t.downloadZip}</span>
                       </button>
                   </>
            </div>
        </aside>

      </main>

      <footer className="mt-4 flex items-center justify-between text-[9px] text-[var(--text-muted)] shrink-0 uppercase tracking-widest border-t border-[var(--border-color)] pt-3">
        <div className="flex flex-wrap gap-4 sm:gap-6 sm:flex-row flex-col">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full"></span>
            CPU_CORES_ALLOCATED: {navigator.hardwareConcurrency || '08'}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--theme-accent)] rounded-full shadow-[0_0_4px_var(--theme-accent)] transition-colors"></span>
            LOCAL_CANVAS_MEMORY: OK
          </span>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
                {Object.keys(THEMES).map(themeKey => {
                   const tOption = THEMES[themeKey as keyof typeof THEMES];
                   const isActive = activeTheme === themeKey;
                   return (
                     <button
                       key={themeKey}
                       onClick={() => setActiveTheme(themeKey as keyof typeof THEMES)}
                       className={`px-3 py-1 rounded-[2px] transition-all text-[10px] font-bold tracking-wider border ${isActive ? 'bg-[var(--text-primary)] text-[var(--bg-main)] border-[var(--text-primary)] shadow-[0_0_8px_var(--theme-accent)]' : 'bg-[var(--bg-button)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                       title={`Theme: ${themeKey}`}
                     >
                        {tOption.label}
                     </button>
                   );
                })}
            </div>
            <div className="hidden sm:block">SOLID CONVERTER STANDALONE ENGINE</div>
        </div>
      </footer>
      </div>
    </div>
  );
}

