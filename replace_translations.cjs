const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// App Component top
const useI18nImport = "import { useI18n } from './i18n';\n";
if (!content.includes(useI18nImport)) {
  content = content.replace("import React, { useState,", useI18nImport + "import React, { useState,");
}

const replacements = [
  // Modals text
  ['画像をクリックして透過する色を選択してください', '{t.imgInspectorDesc}'],
  ['クリックで選択', '{t.clickToSelect}'],
  ['画像上でマウスを動かすと色を取得します', '{t.mouseOverToPick}'],
  ['画像コントラスト調整 ＆ 超解像プレビュー', '{t.ocrPreviewDesc}'],
  ['UPSCALE (OCR用)', '{t.upscaleForOcr}'],
  ['効果適用後の画像{fileItem.extractedText ? \\\'とテキスト\\\' : \\\'\\\'}プレビュー', '{fileItem.extractedText ? t.resultPreviewWithText : t.resultPreviewImageOnly}'],
  ['EXTRACTED TEXT / 抽出テキスト', '{t.extractedTextTitle}'],
  ['ホイールで拡縮 / スペース押しながらドラッグで移動 / そのままドラッグで切り抜き', '{t.adjustModalDesc}'],
  ['EXPOSURE / 露出', '{t.exposureLbl}'],
  ['SATURATION / 彩度 (%)', '{t.saturationLbl}'],
  ['CONTRAST / コントラスト', '{t.contrastLbl}'],
  ['POSTERIZE / 2階調化閾値', '{t.thresholdLbl}'],

  // Header / Settings Tabs
  ['完全ローカル処理・画像変換ツール', '{t.appSubHead}'],
  ['画像ファイルをドラッグ＆ドロップ (PNG, JPG, WEBP, GIF*, BMP, HEIC, EXIF)', '{t.dropZoneText}'],
  ['[ CLEAR ALL / 一括クリア ]', '{t.clearAll}'],
  ['No items in queue / 待機リストなし', '{t.emptyQueue}'],
  ['処理待機リスト', '{t.queueLabel}'],
  ['ドロップ領域', '{t.dropZoneLabel}'],
  ['プレビューと調整', '{t.previewAndAdjust}'],
  ['処理後の画像を拡大プレビュー', '{t.previewEnlarged}'],

  ['タイトル属性用文字列', '置換不要なものは一部個別に扱う'],

  // App Title directly
  ['>■ SOLID IMAGE ENGINE CONVERTER<', '>{t.appTitle}<'],

  ['設定パネル', '{t.settingsPanel}'],
  ['フォーマット＆圧縮', '{t.tabFormat}'],
  ['画像補正・色調', '{t.tabAdjust}'],
  ['リサイズ・切り抜き', '{t.tabResize}'],
  ['効果・特殊', '{t.tabEffects}'],
  ['出力形式', '{t.outputFormat}'],
  ['※ 透過チャネル(Alpha)は維持されます。', '{t.alphaKeepNotice}'],
  ['画像の圧縮', '{t.imageCompress}'],
  ['QUALITY LEVEL / 圧縮品質', '{t.qualityLevel}'],
  ['※ PNG形式では圧縮率を指定できません。', '{t.pngNoCompressNotice}'],

  ['露出・彩度・自由切り抜き', '{t.adjustHeader}'],
  ['露出:', '{t.expInfo}'],
  ['彩度:', '{t.satInfo}'],
  ['切抜:', '{t.cropInfo}'],

  ['解像度リサイズ設定', '{t.resizeHeader}'],
  ['1:1 (等倍)', '{t.resizeNone}'],
  ['倍率', '{t.resizeScale}'],
  ['精密PX', '{t.resizeExact}'],
  ['MULTIPLIER / 倍数', '{t.multiplier}'],
  ['WIDTH / 幅', '{t.widthLabel}'],
  ['HEIGHT / 高さ', '{t.heightLabel}'],
  ['※ アスペクト比は無視され強制リサイズされます', '{t.resizeIgnoreAspectNotice}'],

  ['特殊効果', '{t.effectsHeader}'],
  ['指定色を透過 (PNG/WEBP限定)', '{t.transparencySetting}'],
  ['TARGET COLOR / 透過色', '{t.targetColor}'],
  ['画像から抽出', '{t.extractFromImage}'],
  ['TOLERANCE / 許容値', '{t.tolerance}'],

  ['文字抽出 (OCR)', '{t.ocrHeader}'],
  ['画像から文字列を抽出', '{t.ocrEnable}'],
  ['LANGUAGE / 言語', '{t.language}'],
  ['日本語(縦)', '{t.langJaVert}'],
  ['英+日', '{t.langEnJa}'],
  ['UPSCALE / 超解像拡大', '{t.upscaleOcr}'],
  ['※ 小さな文字の認識精度が向上しますが、処理時間が長くなります。', '{t.upscaleOcrNotice}'],
  ['抽出結果から半角/全角スペースを自動削除', '{t.removeSpaces}'],
  ['コントラストや明るさを調整して抽出精度を上げられます', '{t.ocrTuningNotice1}'],
  ['※ 処理時間に影響します。調整した前処理はOCR実行時に適用されます。', '{t.ocrTuningNotice2}'],

  ['ファイル名設定', '{t.renameHeader}'],
  ['リネーム設定', '{t.tabRename}'],
  ['テキストスキャン(OCR)', '{t.tabTextScan}'],
  ['元ファイル名', '{t.renameOriginal}'],
  ['日付_連番', '{t.renameDateSeq}'],
  ['任意_連番', '{t.renameCustomSeq}'],

  ['※ GIFについて: 変換処理によりアニメーションは無効化され、静止画になります。', '{t.gifWarning}'],
  ['※ 全ての処理はブラウザのローカルで完結し、サーバーには送信されません。', '{t.localProcessWarning}'],

  ['選択した画像を変換実行', '{t.startProcessing}'],
  ['選択結果を一括ZIPダウンロード (2枚以上)', '{t.downloadZip}'],

  // Toast / Messages / Titles / String interpolations
  ['"状態をリセット"', 't.resetState'],
  ['"画像を保存"', 't.saveImage'],
  ['"リストから削除"', 't.removeFromList'],
  ['"カラーピッカーを開く（またはスポイトを使用）"', 't.colorPickerTitle'],
  ["'一部の非対応ファイル（exe等）がスキップされました。サポート形式(PNG, JPG, WEBP, GIF, BMP, HEIC, EXIF)をご確認ください。'", 't.unsupportedFileSkip'],
  ["'クリップボードにコピーしました'", 't.copySuccess'],

];

// For the modals which are out of App context, we need to pass `t` as props.
// I will patch the modal signatures to accept `t: any`
content = content.replace(
  "const EyeDropperModal = ({ fileItem, onClose, onColorSelect }:",
  "const EyeDropperModal = ({ fileItem, onClose, onColorSelect, t }:"
);
content = content.replace(
  "{ fileItem: FileItem, onClose: () => void, onColorSelect: (hex: string) => void }",
  "{ fileItem: FileItem, onClose: () => void, onColorSelect: (hex: string) => void, t: any }"
);
content = content.replace(
  "const OcrTunerModal = ({ \n  fileItem, contrast, brightness, invert, upscale,\n  setContrast, setBrightness, setInvert, setUpscale, onClose \n}:",
  "const OcrTunerModal = ({ \n  fileItem, contrast, brightness, invert, upscale,\n  setContrast, setBrightness, setInvert, setUpscale, onClose, t \n}:"
);
content = content.replace(
  "onClose: () => void \n})",
  "onClose: () => void, t: any \n})"
);
content = content.replace(
  "const ResultPreviewModal = ({ fileItem, onClose }:",
  "const ResultPreviewModal = ({ fileItem, onClose, t }:"
);
content = content.replace(
  "{ fileItem: FileItem, onClose: () => void }",
  "{ fileItem: FileItem, onClose: () => void, t: any }"
);
content = content.replace(
  "const AdjustPreviewModal = ({ \n  fileItem, globalAdjust, onSave, onSync, onClose \n}:",
  "const AdjustPreviewModal = ({ \n  fileItem, globalAdjust, onSave, onSync, onClose, t \n}:"
);
content = content.replace(
  "onClose: () => void \n})",
  "onClose: () => void, t: any \n})"
);


// Replace simple string instances in JSX Text
for (let [search, replacement] of replacements) {
    if (search.includes('ファイル名設定')) {
        content = content.replace(/>\s*ファイル名設定\s*</g, `>{t.renameHeader}<`);
        continue;
    }
    if (search === '>■ SOLID IMAGE ENGINE CONVERTER<') {
        content = content.replace(search, replacement);
        continue;
    }
    if (search === '日本語') {
       // Only replace exactly 日本語 if surrounded by > <
       content = content.replace(/>\s*日本語\s*</g, `>{t.langJa}<`);
       continue;
    }
    if (search === '設定済') {
       content = content.replace(/>\s*設定済\s*</g, `>{t.settingApplied}<`);
       continue;
    }
    if (search === 'リセット') {
       content = content.replace(/>\s*リセット\s*</g, `>{t.resizeReset}<`);
       continue;
    }
    if (search === '抽出結果から半角/全角スペースを自動削除') {
       content = content.replace(search, replacement);
       continue;
    }
    content = content.split(search).join(replacement);
}

// Add the i18n hook into App component
content = content.replace(
  "export default function App() {\n",
  "export default function App() {\n  const { t, lang, setLang } = useI18n();\n"
);

// We need to pass `t` to Modals inside App
content = content.replace(/<EyeDropperModal([^>]*)>/g, "<EyeDropperModal$1 t={t}>");
content = content.replace(/<OcrTunerModal([^>]*)>/g, "<OcrTunerModal$1 t={t}>");
content = content.replace(/<ResultPreviewModal([^>]*)>/g, "<ResultPreviewModal$1 t={t}>");
content = content.replace(/<AdjustPreviewModal([^>]*)>/g, "<AdjustPreviewModal$1 t={t}>");


// Also add Language Toggle UI right next to theme switcher or header
const toggleHtml = `
            <div className="flex bg-[var(--bg-deep)] border border-[var(--border-color)] rounded-sm p-1 ml-4 shadow-inner">
               <button onClick={() => setLang('en')} className={\`px-3 py-1 rounded-sm text-xs font-bold transition-all \${lang === 'en' ? 'bg-[var(--theme-accent-sub)] text-[var(--text-primary)] shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}\`}>EN</button>
               <button onClick={() => setLang('ja')} className={\`px-3 py-1 rounded-sm text-xs font-bold transition-all \${lang === 'ja' ? 'bg-[var(--theme-accent-sub)] text-[var(--text-primary)] shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}\`}>JP</button>
            </div>
`;
// Let's locate the theme buttons. 
content = content.replace(
  '{Object.entries(THEMES).map(([key, theme]) => (',
  toggleHtml + '\n            {Object.entries(THEMES).map(([key, theme]) => ('
);

// We should fix the dynamic class interpolation 
content = content.replace(
  "効果適用後の画像{fileItem.extractedText ? 'とテキスト' : ''}プレビュー",
  "{fileItem.extractedText ? t.resultPreviewWithText : t.resultPreviewImageOnly}"
);

// Status strings mappings
// 'idle': '未処理', // but it's hardcoded somewhere?
content = content.replace(/status === 'idle' \? '未処理'/g, "status === 'idle' ? t.statusIdle");
content = content.replace(/status === 'processing' \? '処理中'/g, "status === 'processing' ? t.statusProcessing");
content = content.replace(/status === 'done' \? '完了'/g, "status === 'done' ? t.statusDone");
content = content.replace(/status === 'error' \? 'エラー'/g, "status === 'error' ? t.statusError");

fs.writeFileSync('src/App.tsx', content, 'utf8');

console.log("Replaced successfully.");
