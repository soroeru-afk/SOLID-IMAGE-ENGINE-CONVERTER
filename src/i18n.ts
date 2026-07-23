import { useState, useCallback, useEffect } from 'react';

type Lang = 'ja' | 'en';

const translations = {
  ja: {
    appTitle: "SOLID IMAGE ENGINE CONVERTER",
    appSubHead: "完全ローカル処理・画像変換ツール",
    appDesc: "ブラウザ完結のプロフェッショナル画像バッチ処理＆変換エンジン",
    unsupportedFileSkip: "一部の非対応ファイル（exe等）がスキップされました。サポート形式(PNG, JPG, WEBP, GIF, BMP, HEIC, EXIF, PDF)をご確認ください。",
    copySuccess: "クリップボードにコピーしました",
    
    // Header
    dropZoneLabel: "ドロップ領域",
    dropZoneText: "ファイル＆画像をドラッグ＆ドロップ (PNG, JPG, WEBP, GIF*, BMP, HEIC, EXIF, PDF)",
    
    // Status
    statusIdle: "未処理",
    statusProcessing: "処理中",
    statusDone: "完了",
    statusError: "エラー",

    // File List
    queueLabel: "処理待機リスト",
    clearAll: "CLEAR ALL / 一括クリア",
    resetState: "状態をリセット",
    saveImage: "画像を保存",
    removeFromList: "リストから削除",
    emptyQueue: "No items in queue / 待機リストなし",
    previewAndAdjust: "プレビューと調整",
    previewEnlarged: "処理後の画像を拡大プレビュー",
    
    // Settings Panel
    settingsPanel: "設定パネル",
    
    // Tabs
    tabFormat: "フォーマット＆圧縮",
    tabAdjust: "画像補正・色調",
    tabResize: "リサイズ・切り抜き",
    tabEffects: "効果・特殊",
    tabRename: "リネーム設定",
    tabTextScan: "テキストスキャン(OCR)",

    // Convert & Compress Tab
    outputFormat: "出力形式",
    alphaKeepNotice: "※ 透過チャネル(Alpha)は維持されます。",
    imageCompress: "画像の圧縮",
    qualityLevel: "QUALITY LEVEL / 圧縮品質",
    pngNoCompressNotice: "※ PNG形式では圧縮率を指定できません。",
    
    // Adjust Tab
    adjustHeader: "露出・彩度・自由切り抜き",
    expInfo: "露出:",
    satInfo: "彩度:",
    cropInfo: "切抜:",
    settingApplied: "設定済",
    
    // Resize Tab
    resizeHeader: "解像度リサイズ設定",
    resizeReset: "リセット",
    resizeNone: "1:1 (等倍)",
    resizeScale: "倍率",
    resizeExact: "精密PX",
    multiplier: "MULTIPLIER / 倍数",
    widthLabel: "WIDTH / 幅",
    heightLabel: "HEIGHT / 高さ",
    resizeIgnoreAspectNotice: "※ アスペクト比は無視され強制リサイズされます",
    
    // Effects Tab
    effectsHeader: "特殊効果",
    transparencySetting: "指定色を透過 (PNG/WEBP限定)",
    targetColor: "TARGET COLOR / 透過色",
    colorPickerTitle: "カラーピッカーを開く（またはスポイトを使用）",
    extractFromImage: "画像から抽出",
    tolerance: "TOLERANCE / 許容値",
    denoiseSetting: "ノイズ・走査線除去 (3x3メディアン)",
    denoiseLabel: "REMOVE NOISE (CLEANER)",
    denoiseNotice: "※ 画質が滑らかになり、処理に数秒かかる場合があります",
    
    // Text Scan Tab
    ocrHeader: "文字抽出 (OCR)",
    ocrEnable: "画像から文字列を抽出",
    language: "LANGUAGE / 言語",
    langEn: "English",
    langJa: "日本語",
    langJaVert: "日本語(縦)",
    langEnJa: "英+日",
    upscaleOcr: "UPSCALE / 超解像拡大",
    upscaleOcrNotice: "※ 小さな文字の認識精度が向上しますが、処理時間が長くなります。",
    removeSpaces: "抽出結果から半角/全角スペースを自動削除",
    ocrTuningNotice1: "コントラストや明るさを調整して抽出精度を上げられます",
    ocrTuningNotice2: "※ 処理時間に影響します。調整した前処理はOCR実行時に適用されます。",

    // Rename Tab
    renameHeader: "ファイル名設定",
    renameOriginal: "元ファイル名",
    renameDateSeq: "日付_連番",
    renameCustomSeq: "任意_連番",
    
    // Warnings
    gifWarning: "※ GIFについて: 変換処理によりアニメーションは無効化され、静止画になります。",
    localProcessWarning: "※ 全ての処理はブラウザのローカルで完結し、サーバーには送信されません。",
    
    // Actions
    startProcessing: "選択した画像を変換実行",
    downloadZip: "選択結果を一括ZIPダウンロード (2枚以上)",
    
    // Modals
    imgInspectorTitle: "IMAGE INSPECTOR",
    imgInspectorDesc: "画像をクリックして透過する色を選択してください",
    clickToSelect: "クリックで選択",
    mouseOverToPick: "画像上でマウスを動かすと色を取得します",
    
    ocrPreviewTitle: "OCR PREVIEW & TUNING",
    ocrPreviewDesc: "画像コントラスト調整 ＆ 超解像プレビュー",
    contrast: "CONTRAST",
    brightness: "BRIGHTNESS",
    upscaleForOcr: "UPSCALE (OCR用)",
    invert: "INVERT",
    
    resultPreviewTitle: "RESULT PREVIEW",
    resultPreviewImageOnly: "効果適用後の画像プレビュー",
    resultPreviewWithText: "効果適用後の画像とテキストプレビュー",
    extractedTextTitle: "EXTRACTED TEXT / 抽出テキスト",
    copyBtn: "COPY",
    
    adjustModalTitle: "ADJUST & CROP PREVIEW",
    adjustModalDesc: "ホイールで拡縮 / スペース押しながらドラッグで移動 / そのままドラッグで切り抜き",
    exposureLbl: "EXPOSURE / 露出",
    saturationLbl: "SATURATION / 彩度 (%)",
    contrastLbl: "CONTRAST / コントラスト",
    thresholdLbl: "POSTERIZE / 2階調化閾値",
    monochrome: "MONOCHROME",
    resetView: "RESET View",
    saveToThisImage: "SAVE TO THIS IMAGE",
    syncToAllImages: "SYNC TO ALL SELECTED IMAGES",
  },
  en: {
    appTitle: "SOLID IMAGE ENGINE CONVERTER",
    appSubHead: "LOCAL ONLY IMAGE PROCESSING TOOL",
    appDesc: "Professional image batch processor and converter working entirely in the browser.",
    unsupportedFileSkip: "Some unsupported files (e.g. exe) were skipped. Supported formats: PNG, JPG, WEBP, GIF, BMP, HEIC, EXIF, PDF.",
    copySuccess: "Copied to clipboard",
    
    // Header
    dropZoneLabel: "Drop Zone",
    dropZoneText: "Drag & Drop Files (PNG, JPG, WEBP, GIF*, BMP, HEIC, EXIF, PDF)",
    
    // Status
    statusIdle: "Idle",
    statusProcessing: "Processing",
    statusDone: "Done",
    statusError: "Error",

    // File List
    queueLabel: "Processing Queue",
    clearAll: "CLEAR ALL",
    resetState: "Reset State",
    saveImage: "Save Image",
    removeFromList: "Remove from list",
    emptyQueue: "No items in queue",
    previewAndAdjust: "Preview & Adjust",
    previewEnlarged: "Enlarged preview of processed image",
    
    // Settings Panel
    settingsPanel: "Settings Panel",
    
    // Tabs
    tabFormat: "Format & Compress",
    tabAdjust: "Adjust & Colors",
    tabResize: "Resize & Crop",
    tabEffects: "Effects",
    tabRename: "Rename Settings",
    tabTextScan: "Text Scan (OCR)",

    // Convert & Compress Tab
    outputFormat: "Output Format",
    alphaKeepNotice: "* Alpha channel will be preserved.",
    imageCompress: "Image Compression",
    qualityLevel: "QUALITY LEVEL",
    pngNoCompressNotice: "* Compression quality cannot be adjusted for PNG format.",
    
    // Adjust Tab
    adjustHeader: "Exposure, Saturation, Crop",
    expInfo: "Exp:",
    satInfo: "Sat:",
    cropInfo: "Crop:",
    settingApplied: "Applied",
    
    // Resize Tab
    resizeHeader: "Resolution Resize Settings",
    resizeReset: "Reset",
    resizeNone: "1:1 (Original)",
    resizeScale: "Scale",
    resizeExact: "Exact Px",
    multiplier: "MULTIPLIER",
    widthLabel: "WIDTH",
    heightLabel: "HEIGHT",
    resizeIgnoreAspectNotice: "* Aspect ratio will be ignored (Force stretch)",
    
    // Effects Tab
    effectsHeader: "Special Effects",
    transparencySetting: "Remove Specific Color (PNG/WEBP only)",
    targetColor: "TARGET COLOR",
    colorPickerTitle: "Open color picker (or use eyedropper)",
    extractFromImage: "Pick from Image",
    tolerance: "TOLERANCE",
    denoiseSetting: "Remove Noise & Scanlines (3x3 Median)",
    denoiseLabel: "REMOVE NOISE (CLEANER)",
    denoiseNotice: "* Image will be smoothed. May take a few seconds.",
    
    // Text Scan Tab
    ocrHeader: "Extract Text (OCR)",
    ocrEnable: "Extract Text from Image",
    language: "LANGUAGE",
    langEn: "English",
    langJa: "Japanese",
    langJaVert: "Japanese (Vert)",
    langEnJa: "En + Ja",
    upscaleOcr: "UPSCALE",
    upscaleOcrNotice: "* Improves small text recognition, but takes longer.",
    removeSpaces: "Auto remove spaces (half/full) from result",
    ocrTuningNotice1: "Adjust contrast and brightness to improve extraction.",
    ocrTuningNotice2: "* Affects processing time. Setup is applied during OCR.",

    // Rename Tab
    renameHeader: "Filename Settings",
    renameOriginal: "Original Name",
    renameDateSeq: "Date & Sequence",
    renameCustomSeq: "Custom Prefix",
    
    // Warnings
    gifWarning: "* GIF notice: Animation will be removed, turning into a static image.",
    localProcessWarning: "* All processing is done locally in your browser. No data is sent to a server.",
    
    // Actions
    startProcessing: "START PROCESSING SELECTED",
    downloadZip: "DOWNLOAD AS ZIP (2+ files)",
    
    // Modals
    imgInspectorTitle: "IMAGE INSPECTOR",
    imgInspectorDesc: "Click the image to select a color for transparency",
    clickToSelect: "Click to Select",
    mouseOverToPick: "Move mouse over image to pick color",
    
    ocrPreviewTitle: "OCR PREVIEW & TUNING",
    ocrPreviewDesc: "Image contrast adjustment & upscaling preview",
    contrast: "CONTRAST",
    brightness: "BRIGHTNESS",
    upscaleForOcr: "UPSCALE (for OCR)",
    invert: "INVERT",
    
    resultPreviewTitle: "RESULT PREVIEW",
    resultPreviewImageOnly: "Preview of image after effects",
    resultPreviewWithText: "Preview image & extracted text after effects",
    extractedTextTitle: "EXTRACTED TEXT",
    copyBtn: "COPY",
    
    adjustModalTitle: "ADJUST & CROP PREVIEW",
    adjustModalDesc: "Wheel: Zoom / Space+Drag: Pan / Drag: Crop",
    exposureLbl: "EXPOSURE",
    saturationLbl: "SATURATION (%)",
    contrastLbl: "CONTRAST (%)",
    thresholdLbl: "POSTERIZE THRESHOLD",
    monochrome: "MONOCHROME",
    resetView: "RESET View",
    saveToThisImage: "SAVE TO THIS IMAGE",
    syncToAllImages: "SYNC TO ALL SELECTED IMAGES",
  }
};

export function useI18n() {
  // Use localStorage to remember lang preference
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('appLang');
    if (saved === 'ja' || saved === 'en') return saved;
    // Default to EN if browser lang is not Japanese
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('appLang', newLang);
  }, []);

  const t = translations[lang];

  return { lang, setLang, t };
}
