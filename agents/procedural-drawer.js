/**
 * agents/procedural-drawer.js — v2.0
 *
 * التغييرات عن v1.0:
 *  - استبدال @napi-rs/canvas بـ jimp خالص — لا native modules
 *  - يعمل على GitHub Actions + Vercel + أي بيئة Node.js
 *  - نفس الوظائف: رسم شخصيات، خلفيات، تأثيرات، حفظ PNG
 *
 * القواعد المطبقة:
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-126 : Node.js خالص — لا native modules
 */

import Jimp        from 'jimp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════════
// ثوابت
// ══════════════════════════════════════════════════════════
const DEFAULT_W = 1280;
const DEFAULT_H =  720;

// لوحة ألوان الكون (memory-shards-saga)
const PALETTE = {
  bg:       0x05050bff,
  deep:     0x0a0a16ff,
  purple:   0x7c3aedff,
  blue:     0x2563ebff,
  cyan:     0x0891b2ff,
  gold:     0xfacc15ff,
  pink:     0xf472b6ff,
  white:    0xf4f5f9ff,
  muted:    0x7c83a0ff,
  black:    0x000000ff,
  transparent: 0x00000000,
};

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════

/** تحويل hex color لـ RGBA components */
function hexToRGBA(hex) {
  return {
    r: (hex >> 24) & 0xff,
    g: (hex >> 16) & 0xff,
    b: (hex >>  8) & 0xff,
    a:  hex        & 0xff,
  };
}

/** رسم مستطيل مملوء */
function fillRect(img, x, y, w, h, color) {
  const { r, g, b, a } = hexToRGBA(color);
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (px >= 0 && py >= 0 && px < img.bitmap.width && py < img.bitmap.height) {
        img.setPixelColor(Jimp.rgbaToInt(r, g, b, a), px, py);
      }
    }
  }
}

/** رسم مستطيل بإطار فقط */
function strokeRect(img, x, y, w, h, color, thickness = 1) {
  fillRect(img, x, y, w, thickness, color);             // top
  fillRect(img, x, y + h - thickness, w, thickness, color); // bottom
  fillRect(img, x, y, thickness, h, color);             // left
  fillRect(img, x + w - thickness, y, thickness, h, color); // right
}

/** رسم دائرة */
function fillCircle(img, cx, cy, radius, color) {
  const { r, g, b, a } = hexToRGBA(color);
  for (let py = cy - radius; py <= cy + radius; py++) {
    for (let px = cx - radius; px <= cx + radius; px++) {
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        if (px >= 0 && py >= 0 && px < img.bitmap.width && py < img.bitmap.height) {
          img.setPixelColor(Jimp.rgbaToInt(r, g, b, a), px, py);
        }
      }
    }
  }
}

/** تدرج أفقي أو عمودي */
function fillGradient(img, x, y, w, h, colorA, colorB, direction = 'vertical') {
  const ca = hexToRGBA(colorA), cb = hexToRGBA(colorB);
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const t = direction === 'vertical'
        ? (py - y) / Math.max(h - 1, 1)
        : (px - x) / Math.max(w - 1, 1);
      const r = Math.round(ca.r + (cb.r - ca.r) * t);
      const g = Math.round(ca.g + (cb.g - ca.g) * t);
      const b = Math.round(ca.b + (cb.b - ca.b) * t);
      const a = Math.round(ca.a + (cb.a - ca.a) * t);
      if (px >= 0 && py >= 0 && px < img.bitmap.width && py < img.bitmap.height) {
        img.setPixelColor(Jimp.rgbaToInt(r, g, b, a), px, py);
      }
    }
  }
}

/** رسم خط */
function drawLine(img, x1, y1, x2, y2, color, thickness = 1) {
  const { r, g, b, a } = hexToRGBA(color);
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
  let err = dx - dy, x = x1, y = y1;
  while (true) {
    // رسم بسمك thickness
    for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
      for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
        const px = x + tx, py = y + ty;
        if (px >= 0 && py >= 0 && px < img.bitmap.width && py < img.bitmap.height) {
          img.setPixelColor(Jimp.rgbaToInt(r, g, b, a), px, py);
        }
      }
    }
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}

/** إضافة نقاط متلألئة عشوائية (نجوم/شظايا) */
function addSparkles(img, count, color, minSize = 1, maxSize = 3) {
  const W = img.bitmap.width, H = img.bitmap.height;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * H);
    const s = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
    const alpha = Math.floor(Math.random() * 156 + 100); // 100-255
    const { r, g, b } = hexToRGBA(color);
    fillCircle(img, x, y, s, Jimp.rgbaToInt(r, g, b, alpha));
  }
}

/** تأثير glow — دائرة متدرجة الشفافية */
function addGlow(img, cx, cy, radius, color) {
  const { r, g, b } = hexToRGBA(color);
  for (let py = cy - radius; py <= cy + radius; py++) {
    for (let px = cx - radius; px <= cx + radius; px++) {
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        if (px >= 0 && py >= 0 && px < img.bitmap.width && py < img.bitmap.height) {
          const alpha = Math.floor((1 - dist / radius) * 80); // شفافية تدريجية
          const existing = Jimp.intToRGBA(img.getPixelColor(px, py));
          const nr = Math.min(255, existing.r + Math.floor(r * alpha / 255));
          const ng = Math.min(255, existing.g + Math.floor(g * alpha / 255));
          const nb = Math.min(255, existing.b + Math.floor(b * alpha / 255));
          img.setPixelColor(Jimp.rgbaToInt(nr, ng, nb, 255), px, py);
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
// رسامات المشاهد
// ══════════════════════════════════════════════════════════

/** خلفية كونية — الفضاء + شظايا الذاكرة */
function drawCosmicBackground(img, mood = 'default') {
  const W = img.bitmap.width, H = img.bitmap.height;

  // تدرج أساسي حسب المزاج
  const moodGrads = {
    fear:        [0x05000fff, 0x1a0a2eff],
    tense:       [0x0a0005ff, 0x2d0a1eff],
    melancholy:  [0x030812ff, 0x0a1428ff],
    wonder:      [0x050514ff, 0x0d0d2fff],
    hope:        [0x050810ff, 0x0a1520ff],
    default:     [0x05050bff, 0x0d0d1fff],
  };
  const [gradA, gradB] = moodGrads[mood] || moodGrads.default;
  fillGradient(img, 0, 0, W, H, gradA, gradB, 'vertical');

  // nebula glow في الزوايا
  addGlow(img, Math.floor(W * 0.2), Math.floor(H * 0.2), 200, PALETTE.purple);
  addGlow(img, Math.floor(W * 0.8), Math.floor(H * 0.3), 160, PALETTE.blue);
  addGlow(img, Math.floor(W * 0.5), Math.floor(H * 0.8), 140, PALETTE.cyan);

  // نجوم
  addSparkles(img, 180, PALETTE.white, 1, 2);
  // شظايا ذاكرة متلألئة
  addSparkles(img, 30, PALETTE.gold, 1, 3);
  addSparkles(img, 20, PALETTE.cyan, 1, 2);
}

/** رسم شخصية مجردة (silhouette + energy lines) */
function drawCharacter(img, spec) {
  const {
    x = 400, y = 200, height = 320,
    color = PALETTE.white, glowColor = PALETTE.purple,
    pose = 'standing', // standing | reaching | collapsed
  } = spec;

  const headR  = Math.floor(height * 0.12);
  const bodyH  = Math.floor(height * 0.35);
  const bodyW  = Math.floor(height * 0.18);
  const legH   = Math.floor(height * 0.28);
  const armL   = Math.floor(height * 0.28);

  // glow خلف الشخصية
  addGlow(img, x, y + Math.floor(height * 0.4), Math.floor(height * 0.55), glowColor);

  // رأس
  const headY = y + headR;
  fillCircle(img, x, headY, headR, color);

  // جسم
  const bodyY = headY + headR + 4;
  fillRect(img, x - Math.floor(bodyW / 2), bodyY, bodyW, bodyH, color);

  // أرجل
  const legY = bodyY + bodyH;
  if (pose === 'collapsed') {
    // ساقان متراكبتان
    fillRect(img, x - bodyW, legY, Math.floor(bodyW * 0.9), Math.floor(legH * 0.5), color);
    fillRect(img, x - Math.floor(bodyW * 0.5), legY + Math.floor(legH * 0.25), Math.floor(bodyW * 0.9), Math.floor(legH * 0.5), color);
  } else {
    fillRect(img, x - Math.floor(bodyW * 0.6), legY, Math.floor(bodyW * 0.45), legH, color);
    fillRect(img, x + Math.floor(bodyW * 0.1), legY, Math.floor(bodyW * 0.45), legH, color);
  }

  // ذراعان
  const armY = bodyY + Math.floor(bodyH * 0.15);
  if (pose === 'reaching') {
    // ذراع ممتدة للأمام
    drawLine(img, x - Math.floor(bodyW / 2), armY, x - Math.floor(bodyW / 2) - armL, armY - Math.floor(armL * 0.5), color, 6);
    drawLine(img, x + Math.floor(bodyW / 2), armY, x + Math.floor(bodyW / 2) + armL, armY - Math.floor(armL * 0.8), color, 6);
  } else {
    drawLine(img, x - Math.floor(bodyW / 2), armY, x - Math.floor(bodyW / 2) - armL, armY + Math.floor(armL * 0.6), color, 6);
    drawLine(img, x + Math.floor(bodyW / 2), armY, x + Math.floor(bodyW / 2) + armL, armY + Math.floor(armL * 0.6), color, 6);
  }

  // energy lines حول الشخصية (تأثير شظايا الذاكرة)
  const { r, g, b } = hexToRGBA(glowColor);
  for (let i = 0; i < 6; i++) {
    const angle  = (i / 6) * Math.PI * 2;
    const len    = Math.floor(height * (0.15 + Math.random() * 0.2));
    const startX = x + Math.floor(Math.cos(angle) * headR * 1.5);
    const startY = headY + Math.floor(Math.sin(angle) * headR * 1.5);
    const endX   = startX + Math.floor(Math.cos(angle) * len);
    const endY   = startY + Math.floor(Math.sin(angle) * len);
    const alpha  = Math.floor(80 + Math.random() * 100);
    drawLine(img, startX, startY, endX, endY, Jimp.rgbaToInt(r, g, b, alpha), 2);
  }
}

/** رسم شظية ذاكرة (مضلع متوهج) */
function drawMemoryShard(img, cx, cy, size, color = PALETTE.gold) {
  const points = 6;
  const { r, g, b } = hexToRGBA(color);
  addGlow(img, cx, cy, size * 2, color);
  for (let i = 0; i < points; i++) {
    const a1 = (i / points) * Math.PI * 2;
    const a2 = ((i + 1) / points) * Math.PI * 2;
    const r1 = size * (0.7 + Math.random() * 0.3);
    const r2 = size * (0.7 + Math.random() * 0.3);
    const x1 = cx + Math.cos(a1) * r1;
    const y1 = cy + Math.sin(a1) * r1;
    const x2 = cx + Math.cos(a2) * r2;
    const y2 = cy + Math.sin(a2) * r2;
    drawLine(img, Math.floor(x1), Math.floor(y1), Math.floor(x2), Math.floor(y2),
      Jimp.rgbaToInt(r, g, b, 200), 2);
    drawLine(img, Math.floor(x1), Math.floor(y1), cx, cy,
      Jimp.rgbaToInt(r, g, b, 80), 1);
  }
  fillCircle(img, cx, cy, Math.floor(size * 0.3), Jimp.rgbaToInt(r, g, b, 220));
}

/** شريط معلومات في الأسفل (بدون نص — jimp لا يدعم fonts خارجية بسهولة) */
function drawInfoBar(img, color = PALETTE.purple) {
  const W = img.bitmap.width, H = img.bitmap.height;
  fillGradient(img, 0, H - 80, W, 80, 0x00000000, 0x000000cc, 'vertical');
  fillRect(img, 0, H - 4, W, 4, color);
}

/** vignette — تعتيم الحواف */
function addVignette(img) {
  const W = img.bitmap.width, H = img.bitmap.height;
  const cx = W / 2, cy = H / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  img.scan(0, 0, W, H, function(px, py, idx) {
    const dx = px - cx, dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
    if (dist > 0.5) {
      const factor = Math.min(1, (dist - 0.5) / 0.5);
      const darkness = Math.floor(factor * 180);
      this.bitmap.data[idx]     = Math.max(0, this.bitmap.data[idx]     - darkness);
      this.bitmap.data[idx + 1] = Math.max(0, this.bitmap.data[idx + 1] - darkness);
      this.bitmap.data[idx + 2] = Math.max(0, this.bitmap.data[idx + 2] - darkness);
    }
  });
}

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════

/**
 * يرسم صورة مشهد كاملة بناءً على وصف المشهد
 * @param {object} scene - { id, mood, location, characters[], shards }
 * @param {string} outputPath - مسار حفظ الصورة
 * @param {object} options - { width, height }
 */
export async function drawScene(scene, outputPath, options = {}) {
  const W = options.width  || DEFAULT_W;
  const H = options.height || DEFAULT_H;

  logger.info('[DRAWER] Drawing scene', { id: scene.id, mood: scene.mood, W, H });

  const img = new Jimp(W, H, PALETTE.bg);

  // 1. خلفية كونية
  drawCosmicBackground(img, scene.mood);

  // 2. عناصر المشهد حسب الوصف
  const mood = (scene.mood || '').toLowerCase();

  // شظايا ذاكرة — عدد أكبر في مشاهد "اكتشاف"
  const shardCount = scene.shards || (mood.includes('wonder') || mood.includes('discover') ? 5 : 2);
  for (let i = 0; i < shardCount; i++) {
    const sx = Math.floor(W * (0.15 + Math.random() * 0.7));
    const sy = Math.floor(H * (0.15 + Math.random() * 0.55));
    const ss = Math.floor(20 + Math.random() * 40);
    const sc = [PALETTE.gold, PALETTE.cyan, PALETTE.purple][i % 3];
    drawMemoryShard(img, sx, sy, ss, sc);
  }

  // 3. شخصيات
  const chars = scene.characters || [];
  const charPositions = [
    { x: Math.floor(W * 0.35), y: Math.floor(H * 0.15), height: Math.floor(H * 0.6) },
    { x: Math.floor(W * 0.65), y: Math.floor(H * 0.18), height: Math.floor(H * 0.52) },
    { x: Math.floor(W * 0.5),  y: Math.floor(H * 0.2),  height: Math.floor(H * 0.55) },
  ];
  const charColors = [PALETTE.white, 0x818cf8ff, 0x34d6c7ff];
  const charGlows  = [PALETTE.purple, PALETTE.blue, PALETTE.cyan];
  const poses      = ['standing', 'reaching', 'collapsed'];

  chars.slice(0, 3).forEach((char, i) => {
    const pos = charPositions[i];
    drawCharacter(img, {
      ...pos,
      color:     charColors[i] || PALETTE.white,
      glowColor: charGlows[i]  || PALETTE.purple,
      pose:      char.pose || poses[mood.includes('fear') || mood.includes('tense') ? 2 : i % 2],
    });
  });

  // إذا لا شخصيات — ارسم silhouette وحيدة في المنتصف
  if (chars.length === 0) {
    drawCharacter(img, {
      x: Math.floor(W * 0.5), y: Math.floor(H * 0.12),
      height: Math.floor(H * 0.65),
      color: PALETTE.white, glowColor: PALETTE.purple,
      pose: mood.includes('reach') ? 'reaching' : 'standing',
    });
  }

  // 4. شريط معلومات + vignette
  drawInfoBar(img, mood.includes('fear') ? PALETTE.pink : PALETTE.purple);
  addVignette(img);

  // 5. حفظ
  mkdirSync(outputPath.split('/').slice(0, -1).join('/'), { recursive: true });
  await img.writeAsync(outputPath);

  logger.info('[OK] Scene drawn', {
    id:   scene.id,
    path: outputPath,
    size: `${W}×${H}`,
  });

  return outputPath;
}

/**
 * يرسم thumbnail للمسلسل (1280×720)
 */
export async function drawThumbnail(episode, outputPath) {
  logger.info('[DRAWER] Drawing thumbnail', { episode: episode.number });

  const W = DEFAULT_W, H = DEFAULT_H;
  const img = new Jimp(W, H, PALETTE.bg);

  drawCosmicBackground(img, 'wonder');

  // شظايا كبيرة في الخلفية
  drawMemoryShard(img, Math.floor(W * 0.2),  Math.floor(H * 0.3), 55, PALETTE.gold);
  drawMemoryShard(img, Math.floor(W * 0.75), Math.floor(H * 0.25), 45, PALETTE.cyan);
  drawMemoryShard(img, Math.floor(W * 0.5),  Math.floor(H * 0.7), 35, PALETTE.purple);

  // شخصية مركزية
  drawCharacter(img, {
    x: Math.floor(W * 0.5), y: Math.floor(H * 0.06),
    height: Math.floor(H * 0.7),
    color: PALETTE.white, glowColor: PALETTE.purple,
    pose: 'reaching',
  });

  // شريط سفلي
  fillGradient(img, 0, H - 100, W, 100, 0x00000000, 0x000000eeff, 'vertical');
  strokeRect(img, 20, H - 70, W - 40, 50, PALETTE.purple, 1);

  // نقاط تدل على رقم الحلقة
  for (let i = 0; i < Math.min(episode.number, 12); i++) {
    const dotX = 40 + i * 22;
    fillCircle(img, dotX, H - 44, 6, i < episode.number - 1 ? PALETTE.muted : PALETTE.gold);
  }

  addVignette(img);

  mkdirSync(outputPath.split('/').slice(0, -1).join('/'), { recursive: true });
  await img.writeAsync(outputPath);

  logger.info('[OK] Thumbnail drawn', { episode: episode.number, path: outputPath });
  return outputPath;
}

/**
 * يرسم صورة شخصية مستقلة (character card)
 */
export async function drawCharacterCard(character, outputPath) {
  const W = 512, H = 768;
  const img = new Jimp(W, H, PALETTE.bg);

  drawCosmicBackground(img, 'melancholy');
  addGlow(img, W / 2, H * 0.45, 200, character.glowColor || PALETTE.purple);

  drawCharacter(img, {
    x: Math.floor(W / 2), y: Math.floor(H * 0.08),
    height: Math.floor(H * 0.65),
    color: character.color || PALETTE.white,
    glowColor: character.glowColor || PALETTE.purple,
    pose: character.pose || 'standing',
  });

  // شظية واحدة مميزة
  drawMemoryShard(img, Math.floor(W * 0.75), Math.floor(H * 0.25), 30, PALETTE.gold);

  fillGradient(img, 0, H - 120, W, 120, 0x00000000, 0x000000eeff, 'vertical');
  addVignette(img);

  mkdirSync(outputPath.split('/').slice(0, -1).join('/'), { recursive: true });
  await img.writeAsync(outputPath);

  logger.info('[OK] Character card drawn', { name: character.name, path: outputPath });
  return outputPath;
}
