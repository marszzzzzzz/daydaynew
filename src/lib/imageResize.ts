import { IMAGE_MAX_BYTES } from "@contracts/products";

/** 輪播卡最闊 200px，2× 螢幕要 400px；留多啲位俾 Google 圖片 */
const MAX_SIDE = 800;
const ATTEMPTS = [
  { side: MAX_SIDE, quality: 0.82 },
  { side: MAX_SIDE, quality: 0.7 },
  { side: 640, quality: 0.7 },
  { side: 480, quality: 0.65 },
];

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

function encode(bitmap: ImageBitmap, side: number, quality: number): string {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", quality);
  // 舊版 Safari 唔識出 WebP 會靜靜雞變 PNG（好大），改用 JPEG
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

/** 將手機相壓縮成網頁用嘅大小（大約 50–200KB）；壓唔落就 throw 中文訊息 */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("請揀相片檔（JPG / PNG / WebP / HEIC）");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("讀唔到呢張相，請轉成 JPG 再試");
  }
  try {
    for (const { side, quality } of ATTEMPTS) {
      const out = encode(bitmap, side, quality);
      if (bytesOf(out) <= IMAGE_MAX_BYTES) return out;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("相片太大，壓縮之後都超過上限");
}
