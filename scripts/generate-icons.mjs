// Generates PWA icons from a procedurally drawn "notebook" glyph.
// Pure JS (pngjs) — no canvas native deps, no network.
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const C = {
  cream: [250, 246, 238],
  cover: [201, 111, 74], // terracotta
  coverDark: [176, 91, 62],
  spine: [140, 72, 46],
  paper: [255, 253, 247],
  line: [222, 210, 192],
  ink: [59, 49, 40],
  red: [196, 74, 74],
};

function blend(base, top, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + top[0] * alpha),
    Math.round(base[1] * (1 - alpha) + top[1] * alpha),
    Math.round(base[2] * (1 - alpha) + top[2] * alpha),
  ];
}

function drawIcon(size, { maskable = false } = {}) {
  const png = new PNG({ width: size, height: size });
  const s = size / 512; // design in 512-space
  const px = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (size * (y | 0) + (x | 0)) << 2;
    const bg = [png.data[idx], png.data[idx + 1], png.data[idx + 2]];
    const c = blend(bg, color, alpha);
    png.data[idx] = c[0];
    png.data[idx + 1] = c[1];
    png.data[idx + 2] = c[2];
    png.data[idx + 3] = 255;
  };
  const rect = (x0, y0, w, h, color) => {
    for (let y = Math.round(y0 * s); y < Math.round((y0 + h) * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round((x0 + w) * s); x++) px(x, y, color);
  };

  // Background: full-bleed terracotta (maskable safe zone: keep glyph within central 80%)
  rect(0, 0, 512, 512, C.cover);
  if (maskable) rect(0, 0, 512, 512, C.cover);

  // Notebook body — rounded rect via corner masking
  const bx = maskable ? 84 : 96;
  const by = maskable ? 84 : 88;
  const bw = 512 - bx * 2;
  const bh = 512 - by * 2;
  const r = 36;
  const inRounded = (x, y) => {
    const cx = Math.max(bx + r, Math.min(x, bx + bw - r));
    const cy = Math.max(by + r, Math.min(y, by + bh - r));
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r || (x >= bx + r && x <= bx + bw - r) || (y >= by + r && y <= by + bh - r);
  };
  for (let y = by; y < by + bh; y++)
    for (let x = bx; x < bx + bw; x++)
      if (inRounded(x, y)) {
        // paper page with slight left shadow near spine
        px(x, y, C.paper);
      }
  // cover edge (right + bottom) to suggest a closed notebook
  rect(bx + bw - 18 * s, by + 12, 18 * s, bh - 12, C.coverDark);

  // spiral spine: dark band + rings
  rect(bx, by, 26 * s, bh, C.spine);
  for (let y = by + 34 * s; y < by + bh - 20 * s; y += 44 * s) {
    rect(bx + 8 * s, y, 30 * s, 9 * s, C.cream);
  }

  // ruled lines
  for (let y = by + 90 * s; y < by + bh - 40 * s; y += 52 * s) {
    rect(bx + 66 * s, y, bw - 100 * s, 3 * s, C.line);
  }

  // a handwritten "Aa" suggestion: two ink strokes (an A shape and a small bump)
  const strokeW = 9 * s;
  const drawLine = (x1, y1, x2, y2, color, w = strokeW) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
    for (let i = 0; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) px(x + dx, y + dy, color);
    }
  };
  const ax = bx + 90 * s;
  const ay = by + 150 * s;
  drawLine(ax, ay + 60 * s, ax + 34 * s, ay, C.ink);
  drawLine(ax + 34 * s, ay, ax + 68 * s, ay + 60 * s, C.ink);
  drawLine(ax + 12 * s, ay + 38 * s, ax + 56 * s, ay + 38 * s, C.ink, 7 * s);

  // red "completed" check dot at the end of a line
  const dotR = 16 * s;
  const dx0 = bx + bw - 92 * s;
  const dy0 = by + 96 * s;
  for (let y = -dotR; y <= dotR; y++)
    for (let x = -dotR; x <= dotR; x++)
      if (x * x + y * y <= dotR * dotR) px(dx0 + x, dy0 + y, C.red);
  // white check inside dot
  drawLine(dx0 - 8 * s, dy0 + 1 * s, dx0 - 2 * s, dy0 + 7 * s, C.paper, 5 * s);
  drawLine(dx0 - 2 * s, dy0 + 7 * s, dx0 + 9 * s, dy0 - 7 * s, C.paper, 5 * s);

  return png;
}

function writePng(png, name) {
  const buf = PNG.sync.write(png);
  writeFileSync(join(outDir, name), buf);
  console.log(`✓ ${name} (${buf.length} bytes)`);
}

writePng(drawIcon(192), 'icon-192.png');
writePng(drawIcon(512), 'icon-512.png');
writePng(drawIcon(512, { maskable: true }), 'maskable-512.png');
writePng(drawIcon(180), 'apple-touch-icon.png');
console.log('Icons generated in public/icons');
