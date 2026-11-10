// Find the cards in one photo of several cards laid out apart from each other (feature: 一相多卡).
// Runs in the browser, no server and no model: the photo is shrunk, the background colour is taken from
// the photo's edges, everything clearly different from it becomes "card", holes are filled, and each
// connected blob that is card-sized and rectangular becomes a box. Two cards that touch come out as one
// wide blob; it is split by the card's shape (63 × 88). The person confirms or fixes the boxes after.

export interface Box { x: number; y: number; w: number; h: number } // in original photo pixels

const WORK = 640; // working size (long side)
const CARD = 63 / 88; // portrait card width / height

/** Sensitivity 0–100: higher finds fainter cards (and more noise). */
export function detectCards(img: CanvasImageSource & { width: number; height: number }, sensitivity = 50): Box[] {
  const W0 = (img as HTMLImageElement).naturalWidth || img.width, H0 = (img as HTMLImageElement).naturalHeight || img.height;
  const k = Math.min(1, WORK / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * k)), H = Math.max(1, Math.round(H0 * k));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;

  // 1. Background colour: median of a band along the photo's edges.
  const band = Math.max(2, Math.round(Math.min(W, H) * 0.03));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= band && x < W - band && y >= band && y < H - band) continue;
    const i = (y * W + x) * 4;
    rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1] ?? 0;
  const br = med(rs), bg = med(gs), bb = med(bs);

  // 2. Foreground: far enough from the background colour, or on a strong edge (a card's border).
  const thr = 90 - sensitivity * 0.7; // 20 (sensitive) … 90 (strict)
  const gray = new Float32Array(W * H);
  for (let i = 0, p = 0; p < W * H; i += 4, p++) gray[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  let fg = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x, i = p * 4;
    const d = Math.hypot(px[i] - br, px[i + 1] - bg, px[i + 2] - bb);
    const gx = gray[p + 1] - gray[p - 1], gy = gray[p + W] - gray[p - W];
    fg[p] = d > thr || Math.hypot(gx, gy) > thr * 1.6 ? 1 : 0;
  }

  // 3. Close small gaps (dilate then erode), then fill holes: background is whatever the edges can reach.
  const r = Math.max(1, Math.round(Math.min(W, H) / 160));
  fg = erode(dilate(fg, W, H, r), W, H, r);
  const outside = new Uint8Array(W * H);
  const stack: number[] = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    if (outside[p] || fg[p]) continue;
    outside[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  for (let p = 0; p < W * H; p++) fg[p] = outside[p] ? 0 : 1;
  // A thin cut separates cards that only just touch.
  fg = erode(fg, W, H, r * 2);

  // 4. Connected blobs → boxes.
  const label = new Int32Array(W * H);
  const found: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!fg[s] || label[s]) continue;
    const id = found.length + 1;
    const b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
    stack.push(s); label[s] = id;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W, y = (p - x) / W;
      b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q >= 0 && q < W * H && fg[q] && !label[q]) { label[q] = id; stack.push(q); }
      }
    }
    found.push(b);
  }

  const area = W * H;
  const blobs: Box[] = [];
  for (const b of found) {
    const w = b.x1 - b.x0 + 1 + r * 4, h = b.y1 - b.y0 + 1 + r * 4; // give back what the cut took
    if (w * h < area * 0.012 || w * h > area * 0.9) continue; // dust, or the whole photo
    if (b.n / ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)) < 0.55) continue; // not rectangle-like
    blobs.push({ x: b.x0 - r * 2, y: b.y0 - r * 2, w, h });
  }
  // Touching cards come out as one blob. With other cards in the photo, a blob about n times the typical
  // card's size is n cards; alone, only a very long blob can be told apart (two portrait cards side by
  // side look like one landscape card).
  const sizes = blobs.map((b) => b.w * b.h).sort((p, q) => p - q);
  const typical = sizes[Math.floor((sizes.length - 1) / 2)] ?? 0;
  const boxes: Box[] = [];
  for (const b of blobs) {
    const long = Math.max(b.w, b.h) / Math.min(b.w, b.h);
    let n = 1;
    if (blobs.length > 1 && typical) n = Math.max(1, Math.round((b.w * b.h) / typical));
    else if (long > 2.1) n = Math.round(long * CARD);
    n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      boxes.push(b.w >= b.h ? { x: b.x + (b.w / n) * i, y: b.y, w: b.w / n, h: b.h } : { x: b.x, y: b.y + (b.h / n) * i, w: b.w, h: b.h / n });
    }
  }

  // Back to photo pixels, inside the photo, in reading order (rows top to bottom, then left to right).
  const out = boxes.map((b) => clamp({ x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k }, W0, H0));
  return readingOrder(out);
}

/** Rows top to bottom (a card joins a row when it overlaps the row's first card vertically), then left to right. */
export function readingOrder(boxes: Box[]): Box[] {
  const rows: Box[][] = [];
  for (const b of [...boxes].sort((p, q) => p.y - q.y)) {
    const row = rows.find((r) => b.y < r[0].y + r[0].h / 2 && b.y + b.h > r[0].y + r[0].h / 2);
    if (row) row.push(b); else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((p, q) => p.x - q.x));
}

function dilate(m: Uint8Array, W: number, H: number, r: number) {
  return morph(m, W, H, r, 1);
}
function erode(m: Uint8Array, W: number, H: number, r: number) {
  return morph(m, W, H, r, 0);
}
/** Square min/max filter, done as two 1-D passes. `keep` 1 = dilate (any set), 0 = erode (all set). */
function morph(m: Uint8Array, W: number, H: number, r: number, keep: 0 | 1) {
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const dst = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = keep ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
        const s = xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : src[yy * W + xx];
        if (keep ? s : !s) { v = keep; break; }
      }
      dst[y * W + x] = v;
    }
    return dst;
  };
  return pass(pass(m, true), false);
}

export function clamp(b: Box, W: number, H: number): Box {
  const x = Math.max(0, Math.min(b.x, W - 1)), y = Math.max(0, Math.min(b.y, H - 1));
  return { x, y, w: Math.max(1, Math.min(b.w - (x - b.x), W - x)), h: Math.max(1, Math.min(b.h - (y - b.y), H - y)) };
}

/** Cut one box out of the full-size photo as a JPEG (a landscape box is turned upright). */
export async function cropCard(img: HTMLImageElement, b: Box): Promise<Blob> {
  const landscape = b.w > b.h * 1.15;
  const scale = Math.min(1, 1600 / Math.max(b.w, b.h));
  const w = Math.round(b.w * scale), h = Math.round(b.h * scale);
  const c = document.createElement('canvas');
  c.width = landscape ? h : w; c.height = landscape ? w : h;
  const g = c.getContext('2d')!;
  if (landscape) { g.translate(h, 0); g.rotate(Math.PI / 2); }
  g.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((x) => (x ? resolve(x) : reject(new Error('crop'))), 'image/jpeg', 0.9));
}
