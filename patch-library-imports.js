/**
 * patch-library-imports.js
 * سكريبت يضيف readForAgent لجميع الوكلاء القدامى تلقائياً
 * شغّله مرة واحدة: node patch-library-imports.js
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR  = join(__dirname, 'agents');

// خريطة كل وكيل → أقسام المكتبة المناسبة
const AGENT_LIBRARY_MAP = {
  'world-birth-agent': {
    maxRules: 15,
    comment:  'game-design, philosophy, procedural, visual-art',
  },
  'story-agent': {
    maxRules: 12,
    comment:  'screenwriting, creative-writing, psychology',
  },
  'soul-agent': {
    maxRules: 10,
    comment:  'philosophy, psychology, storytelling',
  },
  'inventor-agent': {
    maxRules: 12,
    comment:  'game-design, analysis, production',
  },
  'content-agent': {
    maxRules: 10,
    comment:  'cinematography, psychology, production',
  },
  'code-agent': {
    maxRules: 10,
    comment:  'procedural, game-design, visual-art',
  },
  'marketing-agent': {
    maxRules: 8,
    comment:  'production, psychology',
  },
  'roadmap-agent': {
    maxRules: 8,
    comment:  'production, analysis',
  },
  'art-agent': {
    maxRules: 8,
    comment:  'visual-art, cinematography',
  },
  'idea-agent': {
    maxRules: 8,
    comment:  'game-design, storytelling',
  },
};

// الوكلاء التي لا تحتاج المكتبة
const SKIP = [
  '_gemini.js',
  '_soul.js',
  'library-builder-agent.js',
  'collision-agent.js',
  'player-memory.js',
  'template-engineer.js',
  'analytics-agent.js',
  'dialogue-agent.js',
  'scene-agent.js',
  'subtitle-agent.js',
  'series-agent.js',
  'upload-agent.js',
];

const IMPORT_LINE  = `import { readForAgent } from './library-builder-agent.js';`;
const ALREADY_DONE = `readForAgent`;

let patched = 0;
let skipped = 0;

const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.js'));

for (const file of files) {
  if (SKIP.includes(file)) { skipped++; continue; }

  const agentName = file.replace('.js', '');
  const config    = AGENT_LIBRARY_MAP[agentName];
  if (!config) { skipped++; continue; }

  const path    = join(AGENTS_DIR, file);
  let   content = readFileSync(path, 'utf8');

  // تخطّ إذا موجود بالفعل
  if (content.includes(ALREADY_DONE)) {
    console.log(`[SKIP] Already patched: ${file}`);
    skipped++;
    continue;
  }

  // 1. إضافة import بعد آخر import موجود
  const lastImportIdx = findLastImportIndex(content);
  content = content.slice(0, lastImportIdx) +
    `\n${IMPORT_LINE}` +
    content.slice(lastImportIdx);

  // 2. إضافة readForAgent في بداية دالة run()
  content = injectLibraryIntoRun(content, agentName, config);

  writeFileSync(path, content, 'utf8');
  console.log(`[OK] Patched: ${file} (${config.comment})`);
  patched++;
}

console.log(`\n[DONE] Patched: ${patched} | Skipped: ${skipped}`);

// ════════════════════════════════════════════
// دوال مساعدة
// ════════════════════════════════════════════
function findLastImportIndex(content) {
  const lines  = content.split('\n');
  let   lastIdx = 0;
  let   charPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastIdx = charPos + lines[i].length + 1;
    }
    charPos += lines[i].length + 1;
  }
  return lastIdx;
}

function injectLibraryIntoRun(content, agentName, config) {
  // ابحث عن بداية دالة run
  const runMatch = content.match(/export\s+async\s+function\s+run\s*\([^)]*\)\s*\{/);
  if (!runMatch) return content;

  const insertPos = content.indexOf(runMatch[0]) + runMatch[0].length;
  const injection = `
  // ── المكتبة-الجامعة: ${config.comment} ──
  const library = readForAgent('${agentName}', ${config.maxRules});
`;

  return content.slice(0, insertPos) + injection + content.slice(insertPos);
}
