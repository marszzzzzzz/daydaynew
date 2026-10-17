// Copy the OCR engine (tesseract.js worker + WebAssembly core) and language data into public/ocr, so the
// browser loads them from this site instead of a CDN. Runs before dev and build; the output is not committed.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'public/ocr';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/lang`, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${OUT}/worker.min.js`);
// LSTM-only builds (we run OEM 1); tesseract.js picks one by the device's SIMD support.
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${OUT}/${f}`);
}
for (const lang of ['eng', 'chi_tra', 'jpn']) {
  cpSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${OUT}/lang/${lang}.traineddata.gz`);
}
console.log('[ocr] engine and language data copied to', OUT);
