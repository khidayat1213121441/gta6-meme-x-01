// gta6-meme-x-01 — "Waited 13 Years" (Node 22, standard library only).
//
// Generates the meme picture procedurally and deterministically — a Vice City
// sunset beach, the make.fun ghost holding a magenta star, and the joke:
//   "WAITED 13 YEARS FOR GTA 6" / ghost: "MY AGENT ALREADY GOT PAID"
//   banner: "make.fun - AI AGENTS EARN REAL MONEY"
// Every pixel is drawn by this program (software rasterizer + tiny 5x7 bitmap
// font + minimal PNG writer). No network, no wall clock, no files outside the
// repository, no copied image, no Rockstar artwork. Two runs write identical
// bytes (fixed-seed PRNG only).
//
// It also does the starter's job: copy POST.json from the repository root to
// /output/POST.json, where the gate reads it.
//
// Run locally:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------- canvas

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 4);

type RGB = [number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function px(x: number, y: number, c: RGB, a = 1): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const o = (iy * W + ix) * 4;
  const inv = 1 - a;
  img[o] = Math.round(c[0] * a + img[o] * inv);
  img[o + 1] = Math.round(c[1] * a + img[o + 1] * inv);
  img[o + 2] = Math.round(c[2] * a + img[o + 2] * inv);
  img[o + 3] = 255;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Deterministic PRNG (mulberry32, fixed seed).
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261120);

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      px(x, y, c, a);
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    fillRect(cx - dx, cy + dy, cx + dx + 1, cy + dy + 1, c, a);
  }
}

function drawLine(x0: number, y0: number, x1: number, y1: number, width: number, c: RGB): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(lerp(x0, x1, t), lerp(y0, y1, t), width / 2, c);
  }
}

function fillPolygon(points: Array<[number, number]>, c: RGB): void {
  // Scanline fill.
  let minY = H;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, Math.floor(y));
    maxY = Math.max(maxY, Math.ceil(y));
  }
  for (let y = Math.max(0, minY); y <= Math.min(H - 1, maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      fillRect(xs[i], y, xs[i + 1] + 1, y + 1, c);
    }
  }
}

function starPoints(cx: number, cy: number, rOuter: number, rInner: number, rot = -Math.PI / 2): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = rot + (i * Math.PI) / 5;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return pts;
}

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number, c: RGB): void {
  fillRect(x0 + r, y0, x1 - r, y1, c);
  fillRect(x0, y0 + r, x1, y1 - r, c);
  fillCircle(x0 + r, y0 + r, r, c);
  fillCircle(x1 - r, y0 + r, r, c);
  fillCircle(x0 + r, y1 - r, r, c);
  fillCircle(x1 - r, y1 - r, r, c);
}

// ---------------------------------------------------------------- 5x7 font

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01000', '01000', '11110', '01000', '01000', '01000'],
  k: ['00000', '10000', '10010', '10100', '11000', '10100', '10010'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawTextRaw(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT['?'];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === '1') {
          fillRect(cx + col * scale, y + row * scale, cx + (col + 1) * scale, y + (row + 1) * scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawText(s: string, cx: number, y: number, scale: number, c: RGB, outline?: RGB): void {
  const w = textWidth(s, scale);
  const x = Math.round(cx - w / 2);
  if (outline) {
    const o = Math.max(2, Math.floor(scale / 2));
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]] as const) {
      drawTextRaw(s, x + dx, y + dy, scale, outline);
    }
  }
  drawTextRaw(s, x, y, scale, c);
}

// ---------------------------------------------------------------- scene

const INK: RGB = [26, 16, 60];
const WHITE: RGB = [255, 255, 255];
const MAGENTA: RGB = [226, 30, 150];
const DARK: RGB = [20, 12, 50];

function drawScene(): void {
  // Sky gradient (sunset): indigo -> violet -> magenta -> orange -> warm yellow.
  const stops: Array<[number, RGB]> = [
    [0.0, [26, 16, 68]],
    [0.35, [88, 28, 110]],
    [0.6, [190, 60, 120]],
    [0.85, [255, 140, 80]],
    [1.0, [255, 196, 110]],
  ];
  for (let y = 0; y < 600; y++) {
    const t = y / 600;
    let c: RGB = stops[0][1];
    for (let i = 0; i + 1 < stops.length; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        c = mix(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]));
        break;
      }
    }
    fillRect(0, y, W, y + 1, c);
  }

  // Early stars in the upper sky.
  for (let i = 0; i < 42; i++) {
    const x = rnd() * W;
    const y = rnd() * 250;
    const a = 0.25 + rnd() * 0.55;
    px(x, y, WHITE, a);
    if (rnd() > 0.7) px(x + 1, y, WHITE, a * 0.6);
  }

  // Sun + glow.
  fillCircle(512, 545, 180, [255, 150, 70], 0.12);
  fillCircle(512, 545, 140, [255, 160, 80], 0.16);
  fillCircle(512, 545, 110, [255, 180, 100], 0.25);
  fillCircle(512, 545, 88, [255, 214, 120]);

  // Ocean.
  fillRect(0, 600, W, 840, [16, 80, 110]);
  // Sun reflection streak.
  for (let y = 600; y < 840; y++) {
    const a = 0.35 * (1 - (y - 600) / 240);
    const half = 26 + ((y - 600) / 240) * 30;
    fillRect(512 - half, y, 512 + half, y + 1, [255, 190, 110], a);
  }
  // Wave streaks.
  for (let i = 0; i < 30; i++) {
    const y = 610 + rnd() * 220;
    const x = rnd() * W;
    const len = 40 + rnd() * 130;
    const a = 0.18 + rnd() * 0.3;
    fillRect(x, y, x + len, y + 3, [40, 140, 170], a);
  }

  // Sand.
  fillRect(0, 840, W, H, [232, 196, 138]);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W;
    const y = 845 + rnd() * 175;
    px(x, y, rnd() > 0.5 ? [200, 160, 105] : [245, 215, 165], 0.7);
  }

  // Distant skyline silhouettes along the horizon.
  let bx = 30;
  while (bx < 990) {
    const bw = 42 + rnd() * 48;
    const bh = 30 + rnd() * 85;
    fillRect(bx, 600 - bh, bx + bw, 600, [30, 18, 60]);
    // Lit windows.
    const cols = Math.floor(bw / 14);
    const rows = Math.floor(bh / 18);
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (rnd() > 0.55) {
          fillRect(bx + 6 + cx * 14, 600 - bh + 8 + cy * 18, bx + 10 + cx * 14, 600 - bh + 14 + cy * 18, [255, 200, 90], 0.9);
        }
      }
    }
    bx += bw + 6 + rnd() * 22;
  }

  // Palm trees (silhouettes).
  drawPalm(105, 640, 132, 330, -1);
  drawPalm(922, 640, 892, 360, 1);

  // Title.
  drawText('WAITED 13 YEARS', 512, 48, 9, WHITE, INK);
  drawText('FOR GTA 6', 512, 148, 11, WHITE, INK);

  // Speech bubble (ghost's line).
  roundedRect(296, 306, 648, 452, 26, WHITE);
  fillPolygon([[600, 430], [664, 452], [648, 470]], WHITE);
  drawText('MY AGENT', 472, 330, 5, INK);
  drawText('ALREADY', 472, 372, 5, INK);
  drawText('GOT PAID', 472, 414, 5, INK);

  // The make.fun ghost.
  drawGhost(712, 470);

  // Bottom banner: the make.fun name + the earn line.
  fillRect(0, 905, W, 1000, DARK);
  fillRect(0, 905, W, 909, MAGENTA);
  drawText('make.fun - AI AGENTS EARN REAL MONEY', 512, 933, 4, WHITE);
}

function drawPalm(baseX: number, baseY: number, topX: number, topY: number, dir: number): void {
  const c: RGB = [24, 14, 52];
  // Curved trunk: quadratic from base to top.
  const steps = 24;
  let prevX = baseX;
  let prevY = baseY;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(lerp(baseX, (baseX + topX) / 2 + dir * 30, t), lerp((baseX + topX) / 2 + dir * 30, topX, t), t);
    const y = lerp(lerp(baseY, (baseY + topY) / 2, t), lerp((baseY + topY) / 2, topY, t), t);
    drawLine(prevX, prevY, x, y, 16 - 8 * t, c);
    prevX = x;
    prevY = y;
  }
  // Fronds: 7 drooping arcs from the crown.
  for (let f = 0; f < 7; f++) {
    const ang = Math.PI * (0.08 + (f / 6) * 0.84);
    const len = 95 + (f % 3) * 18;
    const ex = topX + Math.cos(ang) * len * dir;
    const ey = topY + Math.abs(Math.sin(ang)) * len * 0.55 + 26;
    const mx = topX + Math.cos(ang) * len * 0.5 * dir;
    const my = topY - 14 + Math.abs(Math.sin(ang)) * len * 0.2;
    let px0 = topX;
    let py0 = topY;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const x = lerp(lerp(topX, mx, t), lerp(mx, ex, t), t);
      const y = lerp(lerp(topY, my, t), lerp(my, ey, t), t);
      drawLine(px0, py0, x, y, 5, c);
      px0 = x;
      py0 = y;
    }
  }
  // Coconuts.
  fillCircle(topX - 10 * dir, topY + 12, 7, c);
  fillCircle(topX + 8 * dir, topY + 14, 7, c);
}

function drawGhost(cx: number, cy: number): void {
  // Body outline: dome top, straight sides, wavy hem (3 points).
  const pts: Array<[number, number]> = [];
  // Dome: half circle centred at (cx, cy-40) radius 74, top half.
  for (let a = Math.PI; a >= 0; a -= Math.PI / 24) {
    pts.push([cx + 74 * Math.cos(a), cy - 40 - 74 * Math.sin(a)]);
  }
  pts.push([cx + 74, cy + 78]);
  pts.push([cx + 50, cy + 52]);
  pts.push([cx + 25, cy + 78]);
  pts.push([cx, cy + 52]);
  pts.push([cx - 25, cy + 78]);
  pts.push([cx - 50, cy + 52]);
  pts.push([cx - 74, cy + 78]);
  fillPolygon(pts, WHITE);
  // Thin outline.
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    drawLine(x0, y0, x1, y1, 3, [200, 200, 220]);
  }
  // Eyes (black ovals) with sparkles.
  fillCircle(cx - 28, cy - 42, 13, [16, 12, 30]);
  fillCircle(cx + 28, cy - 42, 13, [16, 12, 30]);
  px(cx - 31, cy - 47, WHITE);
  px(cx - 30, cy - 48, WHITE);
  px(cx + 25, cy - 47, WHITE);
  px(cx + 26, cy - 48, WHITE);
  // Smile.
  for (let a = 0.15 * Math.PI; a <= 0.85 * Math.PI; a += 0.08) {
    px(cx + 15 * Math.cos(a), cy - 6 + 10 * Math.sin(a), [16, 12, 30]);
    px(cx + 15 * Math.cos(a), cy - 5 + 10 * Math.sin(a), [16, 12, 30]);
  }
  // Magenta star coin held at its right side.
  fillPolygon(starPoints(cx + 96, cy + 10, 36, 15), MAGENTA);
  for (let i = 0; i < 10; i++) {
    const p = starPoints(cx + 96, cy + 10, 36, 15);
    drawLine(p[i][0], p[i][1], p[(i + 1) % 10][0], p[(i + 1) % 10][1], 3, [160, 10, 100]);
  }
  // Sparkle near the star.
  fillPolygon(starPoints(cx + 148, cy - 52, 14, 5), WHITE);
}

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    raw.set(img.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- main

drawScene();
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'meme.png'), encodePNG());
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
