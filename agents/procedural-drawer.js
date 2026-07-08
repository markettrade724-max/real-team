/**
 * procedural-drawer.js — v1.0
 *
 * Draws characters procedurally using three combined styles:
 *  1. Particle field      — atmospheric cosmic background
 *  2. Crystal shards      — irregular geometric polygons (memory fragments)
 *  3. Constellation       — skeleton points connected by lines (character body)
 *
 * Zero API calls — deterministic via seed — fully offline
 * Output: 1920×1080 PNG composited on Pollinations background
 *
 * Requires: npm install @napi-rs/canvas
 * (pre-built binaries for windows-x64 — no native compilation needed)
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'fs';
import { logger } from '../logger.js';

// ══════════════════════════════════════════════════════════
// Seeded RNG — Mulberry32 — pure JS, zero deps
// ══════════════════════════════════════════════════════════
function createRNG(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max)  { return min + this.next() * (max - min); },
    int(min, max)    { return Math.floor(this.range(min, max + 1)); },
    pick(arr)        { return arr[this.int(0, arr.length - 1)]; },
  };
}

// ══════════════════════════════════════════════════════════
// Character skeleton definitions
// Points: normalized [x, y] in 0–1 space
// Connections: pairs of point indices
// primaryNodes: highlighted joints (larger dots + extra glow)
// ══════════════════════════════════════════════════════════
const CHARACTERS = {
  lyra: {
    color:       '#c084fc',
    glowColor:   '#a855f7',
    shardColors: ['#8b5cf6', '#c4b5fd', '#7c3aed', '#ede9fe', '#6d28d9'],
    poses: {
      idle: {
        points: [
          [0.50, 0.09], // 0  head
          [0.50, 0.18], // 1  neck
          [0.34, 0.26], // 2  shoulder_l
          [0.66, 0.26], // 3  shoulder_r
          [0.26, 0.42], // 4  elbow_l
          [0.74, 0.42], // 5  elbow_r
          [0.24, 0.55], // 6  wrist_l
          [0.76, 0.54], // 7  wrist_r
          [0.50, 0.40], // 8  core
          [0.50, 0.55], // 9  hip
          [0.41, 0.57], // 10 hip_l
          [0.59, 0.57], // 11 hip_r
          [0.39, 0.73], // 12 knee_l
          [0.61, 0.73], // 13 knee_r
          [0.37, 0.89], // 14 foot_l
          [0.63, 0.89], // 15 foot_r
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 1, 8, 9],
      },
      running: {
        points: [
          [0.53, 0.09],
          [0.53, 0.17],
          [0.40, 0.24],
          [0.66, 0.24],
          [0.26, 0.34], // arm swept back
          [0.78, 0.36], // arm forward
          [0.20, 0.22], // hand up-back
          [0.82, 0.50], // hand forward-down
          [0.53, 0.37], // core leaning
          [0.53, 0.52],
          [0.46, 0.54],
          [0.60, 0.54],
          [0.36, 0.66], // stride forward
          [0.68, 0.72], // stride back
          [0.29, 0.52], // foot lifted
          [0.72, 0.88], // foot behind
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 1, 8, 14],
      },
      combat: {
        points: [
          [0.52, 0.09],
          [0.52, 0.17],
          [0.36, 0.28],
          [0.68, 0.24],
          [0.24, 0.40],
          [0.82, 0.30], // weapon arm raised
          [0.20, 0.50],
          [0.90, 0.18], // weapon tip
          [0.50, 0.42],
          [0.50, 0.57],
          [0.38, 0.59],
          [0.62, 0.59],
          [0.33, 0.75],
          [0.67, 0.74],
          [0.30, 0.90],
          [0.70, 0.89],
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 1, 7, 9], // weapon tip highlighted
      },
      talk_open: {
        points: [
          [0.50, 0.09],
          [0.50, 0.17],
          [0.33, 0.26],
          [0.67, 0.26],
          [0.20, 0.36], // arm gesturing
          [0.74, 0.40],
          [0.14, 0.28], // pointing hand
          [0.76, 0.53],
          [0.50, 0.40],
          [0.50, 0.55],
          [0.41, 0.57],
          [0.59, 0.57],
          [0.39, 0.73],
          [0.61, 0.73],
          [0.37, 0.89],
          [0.63, 0.89],
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 6], // head + pointing hand
      },
      talk_closed: {
        points: [
          [0.50, 0.09],
          [0.50, 0.17],
          [0.35, 0.26],
          [0.65, 0.26],
          [0.30, 0.40],
          [0.70, 0.40],
          [0.32, 0.53],
          [0.68, 0.52],
          [0.50, 0.40],
          [0.50, 0.55],
          [0.41, 0.57],
          [0.59, 0.57],
          [0.39, 0.73],
          [0.61, 0.73],
          [0.37, 0.89],
          [0.63, 0.89],
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 1, 9],
      },
      injured: {
        points: [
          [0.48, 0.12], // head drooping
          [0.49, 0.20],
          [0.36, 0.29],
          [0.63, 0.27],
          [0.30, 0.44], // hand pressed to wound
          [0.70, 0.42],
          [0.38, 0.50], // hand on side
          [0.72, 0.55],
          [0.49, 0.44], // slumped
          [0.49, 0.59],
          [0.40, 0.61],
          [0.58, 0.61],
          [0.37, 0.76],
          [0.60, 0.75],
          [0.35, 0.91],
          [0.62, 0.90],
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 6, 9],
      },
    },
  },

  kael: {
    color:       '#60a5fa',
    glowColor:   '#3b82f6',
    shardColors: ['#1d4ed8', '#60a5fa', '#93c5fd', '#bfdbfe', '#2563eb'],
    poses: {
      present: {
        points: [
          [0.50, 0.10],
          [0.50, 0.18],
          [0.37, 0.26],
          [0.63, 0.26],
          [0.30, 0.40],
          [0.70, 0.40],
          [0.28, 0.52],
          [0.72, 0.52],
          [0.50, 0.40],
          [0.50, 0.56],
          [0.42, 0.58],
          [0.58, 0.58],
          [0.40, 0.73],
          [0.60, 0.73],
          [0.38, 0.88],
          [0.62, 0.88],
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 1, 8, 9],
      },
      fading: {
        points: [
          [0.50, 0.10],
          [0.50, 0.18],
          [0.38, 0.27],
          [0.62, 0.25], // slightly asymmetric — dissolving
          [0.31, 0.41],
          [0.69, 0.39],
          [0.29, 0.53],
          [0.71, 0.51],
          [0.50, 0.41],
          [0.50, 0.57],
          [0.42, 0.59],
          [0.58, 0.59],
          [0.40, 0.74],
          [0.60, 0.73],
          [0.38, 0.89],
          [0.60, 0.88],
        ],
        connections: [
          [0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,7],
          [1,8],[8,9],[9,10],[9,11],[10,12],[11,13],[12,14],[13,15],
        ],
        primaryNodes: [0, 1], // only head/neck remain bright when fading
      },
    },
  },
};

// ══════════════════════════════════════════════════════════
// Mood → pose mapping (matches screenplay-agent v2.3 enums)
// ══════════════════════════════════════════════════════════
const MOOD_TO_POSE = {
  tense:      'combat',
  urgent:     'running',
  dread:      'talk_closed',
  desperate:  'injured',
  triumphant: 'talk_open',
  calm:       'idle',
};

export function moodToPose(charId, mood) {
  const charDef = CHARACTERS[charId];
  if (!charDef) return null;
  const pose = MOOD_TO_POSE[mood] || 'idle';
  // Fallback: if pose doesn't exist for this character use first available
  return charDef.poses[pose] ? pose : Object.keys(charDef.poses)[0];
}

// ══════════════════════════════════════════════════════════
// Drawing layers
// ══════════════════════════════════════════════════════════

function drawParticleField(ctx, w, h, rng, accentColor) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0,   '#05050b');
  grad.addColorStop(0.5, '#07071a');
  grad.addColorStop(1,   '#030308');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // White particles (stars)
  const count = rng.int(200, 320);
  for (let i = 0; i < count; i++) {
    const x  = rng.range(0, w);
    const y  = rng.range(0, h);
    const r  = rng.range(0.3, 2.0);
    const op = rng.range(0.06, 0.50);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${op.toFixed(2)})`;
    ctx.fill();
  }

  // Accent-colored memory particles
  const [ar, ag, ab] = hexToRgb(accentColor);
  const accentCount  = rng.int(25, 45);
  for (let i = 0; i < accentCount; i++) {
    const x  = rng.range(0, w);
    const y  = rng.range(0, h);
    const r  = rng.range(0.5, 2.8);
    const op = rng.range(0.10, 0.40);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${ar},${ag},${ab},${op.toFixed(2)})`;
    ctx.fill();
  }

  // Faint nebula bloom
  const nx = rng.range(0.2, 0.8) * w;
  const ny = rng.range(0.15, 0.65) * h;
  const nr = rng.range(220, 420);
  const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
  ng.addColorStop(0, `rgba(${ar},${ag},${ab},0.05)`);
  ng.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, 0, w, h);
}

function drawCrystalShards(ctx, w, h, rng, shardColors, cxCenter, cyCenter) {
  const count = rng.int(7, 12);
  for (let s = 0; s < count; s++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist  = rng.range(110, 360);
    const cx    = Math.max(30, Math.min(w - 30, cxCenter + Math.cos(angle) * dist));
    const cy    = Math.max(30, Math.min(h - 30, cyCenter + Math.sin(angle) * dist));
    const size  = rng.range(16, 58);
    const sides = rng.int(4, 7);
    const color = rng.pick(shardColors);
    const [r, g, b] = hexToRgb(color);
    const rot   = rng.range(0, Math.PI * 2);
    const op    = rng.range(0.22, 0.60);

    // Irregular polygon
    const pts = [];
    for (let p = 0; p < sides; p++) {
      const a      = rot + (p / sides) * Math.PI * 2;
      const jitter = rng.range(0.50, 1.0);
      pts.push([cx + Math.cos(a) * size * jitter, cy + Math.sin(a) * size * jitter]);
    }

    // Fill
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},${(op * 0.35).toFixed(2)})`;
    ctx.fill();

    // Outline
    ctx.strokeStyle = `rgba(${r},${g},${b},${op.toFixed(2)})`;
    ctx.lineWidth   = rng.range(0.7, 1.8);
    ctx.stroke();

    // Inner refraction line
    if (pts.length >= 4) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[Math.floor(pts.length / 2)][0], pts[Math.floor(pts.length / 2)][1]);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(op * 0.55).toFixed(2)})`;
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }
  }
}

function drawConstellationCharacter(ctx, w, h, poseDef, color, glowColor, alpha) {
  const { points, connections, primaryNodes } = poseDef;
  const [cr, cg, cb] = hexToRgb(color);
  const [gr, gg, gb] = hexToRgb(glowColor);

  // Character zone: center 38% of width, 88% of height
  const charW = w * 0.38;
  const charH = h * 0.88;
  const charX = (w - charW) / 2;
  const charY = h * 0.06;

  const sc = points.map(([nx, ny]) => [
    charX + nx * charW,
    charY + ny * charH,
  ]);

  // Connections
  for (const [a, b] of connections) {
    const [x1, y1] = sc[a];
    const [x2, y2] = sc[b];

    // Outer glow
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},${(0.14 * alpha).toFixed(2)})`;
    ctx.lineWidth   = 4.5;
    ctx.stroke();

    // Main line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.55 * alpha).toFixed(2)})`;
    ctx.lineWidth   = 1.2;
    ctx.stroke();
  }

  // Nodes
  for (let i = 0; i < sc.length; i++) {
    const [x, y]    = sc[i];
    const isPrimary = primaryNodes?.includes(i) ?? false;
    const r         = isPrimary ? 6.0 : 2.8;

    // Radial glow
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    grd.addColorStop(0, `rgba(${gr},${gg},${gb},${(0.50 * alpha).toFixed(2)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.90 * alpha).toFixed(2)})`;
    ctx.fill();

    // Bright center on primary nodes
    if (isPrimary) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(0.88 * alpha).toFixed(2)})`;
      ctx.fill();
    }
  }
}

// ══════════════════════════════════════════════════════════
// Main export: draw one character scene
// bgImagePath = Pollinations background (optional)
// ══════════════════════════════════════════════════════════
export async function drawCharacter(charId, pose, seed, outputPath, bgImagePath = null) {
  const W = 1920, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const charDef = CHARACTERS[charId];
  if (!charDef) {
    logger.warn(`[DRAW] Unknown character: ${charId}`);
    return null;
  }

  const poseKey = charDef.poses[pose] ? pose : Object.keys(charDef.poses)[0];
  const poseDef = charDef.poses[poseKey];
  const rng     = createRNG(seed + poseKey.length);

  // Layer 1: Background
  let bgSource = 'procedural';
  if (bgImagePath && existsSync(bgImagePath)) {
    try {
      const bg = await loadImage(bgImagePath);
      ctx.drawImage(bg, 0, 0, W, H);
      // Darken so constellation is readable
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.fillRect(0, 0, W, H);
      bgSource = 'pollinations';
    } catch (err) {
      logger.warn(`[DRAW] Background image failed to load, falling back to procedural: ${bgImagePath}`, { error: err.message });
      drawParticleField(ctx, W, H, rng, charDef.glowColor);
    }
  } else {
    drawParticleField(ctx, W, H, rng, charDef.glowColor);
  }

  // Layer 2: Crystal shards
  drawCrystalShards(ctx, W, H, rng, charDef.shardColors, W / 2, H / 2);

  // Layer 3: Constellation character
  // Kael is translucent (echo — no physical body)
  const alpha = charId === 'kael'
    ? (poseKey === 'fading' ? 0.38 : 0.60)
    : 1.0;
  drawConstellationCharacter(ctx, W, H, poseDef, charDef.color, charDef.glowColor, alpha);

  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
  logger.info(`[DRAW] Rendered: ${charId}/${poseKey}`, {
    path:  outputPath,
    bytes: buffer.length,
    bg:    bgSource,
  });
  return outputPath;
}

// ── Helpers ───────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
