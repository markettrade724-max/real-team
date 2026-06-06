/**
 * revival-agent.js — v1.1
 *
 * التغييرات عن v1.0:
 *  - دمج imports من _gemini.js في سطر واحد
 *  - canAfford() بدل حساب يدوي (rule-153)
 *  - generateGodotCode: maxOutputTokens 8192 → 32768
 *  - generateGodotCode: temperature 0.7 → 0.2 (rule-146)
 *  - mkdirSync لـ public/ قبل الكتابة
 *
 * القواعد المطبقة:
 *  rule-056 : soulContext قبل كل عمل
 *  rule-087 : askGemini(prompt, temp, options, caller)
 *  rule-089 : كل الردود JSON
 *  rule-098 : askGemini فقط
 *  rule-099 : [INFO]/[OK]/[ERROR]/[WARN]
 *  rule-101 : maxOutputTokens لا maxTokens
 *  rule-102 : لا JSON.parse
 *  rule-109 : نسخ products.json إلى public/
 *  rule-128 : caller logging
 *  rule-146 : كود GDScript → temperature 0.2
 *  rule-153 : canAfford قبل البدء
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname }                       from 'path';
import { fileURLToPath }                       from 'url';
import { askGemini, canAfford }                from './_gemini.js';
import { soulContext }                         from './_soul.js';
import { readForAgent }                        from './library-builder-agent.js';
import { logger }                              from '../logger.js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const PRODUCTS_PATH = join(__dirname, '..', 'products.json');
const PUBLIC_PATH   = join(__dirname, '..', 'public', 'products.json');
const RECIPES_DIR   = join(__dirname, '..', 'godot-recipes');
const TEMPLATE_PATH = join(__dirname, 'template.json');

function loadTemplate() {
  if (!existsSync(TEMPLATE_PATH)) return null;
  try { return JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8')); }
  catch { return null; }
}

const SKIP_TYPES  = ['godot'];
const MAX_PER_RUN = 3;

// تكلفة إحياء منتج واحد = 2 طلب
const REVIVAL_COST = 2;

// ══════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════
export async function run(universe) {
  logger.info('[REVIVAL] Agent awakening — scanning old products...');

  const products = loadProducts();
  const soul     = soulContext('revivalAgent');
  const library  = readForAgent('revival-agent', 8);

  if (!products.length) {
    logger.warn('[REVIVAL] No products found');
    return { revived: 0 };
  }

  if (!universe?.soul) {
    logger.warn('[REVIVAL] No universe soul — cannot revive without spirit');
    return { revived: 0 };
  }

  // rule-153: تحقق من الحصة قبل البدء
  if (!canAfford('revival')) {
    logger.warn('[REVIVAL] Insufficient quota for revival');
    return { revived: 0, reason: 'quota-insufficient' };
  }

  const candidates = products
    .filter(p => !SKIP_TYPES.includes(p.type) && p.status === 'available')
    .filter(p => !p.revived)
    .slice(0, MAX_PER_RUN);

  if (!candidates.length) {
    logger.info('[REVIVAL] All products already revived');
    return { revived: 0 };
  }

  logger.info(`[REVIVAL] Found ${candidates.length} candidates`);

  let revivedCount = 0;

  for (const product of candidates) {
    // rule-153: تحقق قبل كل منتج
    if (!canAfford('revival')) {
      logger.warn('[REVIVAL] Quota reached mid-run — stopping');
      break;
    }

    logger.info(`[REVIVAL] Reviving: "${product.name?.en}"...`);
    try {
      const revived = await reviveProduct(product, universe, soul, library);
      if (revived) {
        const idx = products.findIndex(p => p.id === product.id);
        if (idx !== -1) products[idx] = revived;
        revivedCount++;
        logger.info(`[OK] Revived: "${revived.name?.en}" → godot`);
      }
    } catch (err) {
      logger.error(`[ERROR] Revival failed for ${product.id}`, { error: err.message });
    }
  }

  if (revivedCount > 0) {
    const json = JSON.stringify(products, null, 2);
    writeFileSync(PRODUCTS_PATH, json, 'utf8');
    // rule-109: نسخ إلى public/
    mkdirSync(join(__dirname, '..', 'public'), { recursive: true });
    writeFileSync(PUBLIC_PATH, json, 'utf8');
    logger.info('[OK] Revival complete', { revived: revivedCount });
  }

  return { revived: revivedCount, total: candidates.length };
}

// ══════════════════════════════════════════════════════════
// ترقية منتج واحد
// ══════════════════════════════════════════════════════════
async function reviveProduct(product, universe, soul, library) {
  const closestWorld = findClosestWorld(product, universe);
  const recipes      = loadAvailableRecipes();

  const newIdentity = await generateNewIdentity(product, universe, closestWorld, soul, library);
  if (!newIdentity) return null;

  const godotCode = await generateGodotCode(newIdentity, universe, closestWorld, soul, library, recipes);
  if (!godotCode) return null;

  writeGodotProject(product.slug, godotCode, newIdentity);

  return buildRevivedProduct(product, newIdentity, closestWorld, universe);
}

// ══════════════════════════════════════════════════════════
// توليد الهوية الجديدة
// ══════════════════════════════════════════════════════════
async function generateNewIdentity(product, universe, world, soul, library) {
  try {
    return await askGemini(`${soul}
${library}

حوّل هذا المنتج إلى لعبة Godot 3D بروح الكون.

المنتج: "${product.name?.en}" — ${product.desc?.en?.slice(0, 80)}
روح الكون: "${universe.soul?.essence?.slice(0, 80)}"
العالم: "${world?.name?.en || 'العالم الأول'}"

أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "concept":         "جملة شاعرية قصيرة",
  "gameplay":        "آلية اللعب في جملتين",
  "godotFeatures":   ["ميزة 1", "ميزة 2"],
  "worldConnection": "جملة واحدة",
  "name":    { "ar": "${product.name?.ar}", "en": "${product.name?.en}" },
  "desc":    { "ar": "وصف قصير", "en": "Short description" },
  "accent":  "${universe.art?.accent   || '#00ff88'}",
  "gradient":"${universe.art?.gradient || '135deg,#020209,#080820'}"
}`,
      0.9,
      { maxOutputTokens: 1024, topP: 0.95 },
      'revival-agent'
    );
  } catch (err) {
    logger.error('[ERROR] Identity generation failed', { error: err.message });
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// توليد كود Godot
// ══════════════════════════════════════════════════════════
async function generateGodotCode(identity, universe, world, soul, library, recipes) {
  try {
    return await askGemini(`${soul}
${library}

اكتب GDScript كامل لـ Godot 4.6.2 — لا اختصار — لا حذف.

المفهوم: "${identity.concept}"
آلية اللعب: "${identity.gameplay}"
العالم: "${world?.name?.en || 'Unknown'}"

${recipes.length > 0
  ? `وصفات متاحة:\n${recipes.slice(0, 3).map(r => `- ${r.filename}: ${r.usage}`).join('\n')}`
  : ''}

القواعد:
- tabs للـ indentation — ليس spaces
- add_to_group("player") في _ready() في player.gd
- add_to_group("enemy")  في _ready() في enemy.gd
- is_inside_tree() قبل queue_free() بعد أي await
- process_mode = ALWAYS في main_scene.gd
- دعم InputEventScreenTouch
- gravity_scale = 0.0 في bullet.gd
- NavigationAgent3D في enemy.gd

أنتج JSON فقط — بدون أي نص خارج JSON:
{
  "main_scene.gd": "<كود كامل>",
  "player.gd":     "<كود كامل>",
  "enemy.gd":      "<كود كامل>",
  "weapon.gd":     "<كود كامل>",
  "bullet.gd":     "<كود كامل>"
}`,
      0.2,
      { maxOutputTokens: 32768, topP: 0.85 },
      'revival-agent'
    );
  } catch (err) {
    logger.error('[ERROR] Godot code generation failed', { error: err.message });
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// كتابة ملفات المشروع
// ══════════════════════════════════════════════════════════
function writeGodotProject(slug, scripts, identity) {
  const projectDir = join(__dirname, '..', 'godot-projects', slug);
  mkdirSync(projectDir, { recursive: true });

  for (const [filename, code] of Object.entries(scripts)) {
    if (typeof code === 'string' && code.trim()) {
      writeFileSync(join(projectDir, filename), code, 'utf8');
    }
  }

  writeFileSync(join(projectDir, 'project.godot'),      buildProjectGodot(slug, identity), 'utf8');
  writeFileSync(join(projectDir, 'export_presets.cfg'), EXPORT_PRESETS,                    'utf8');

  logger.info(`[OK] Godot project written: ${slug}`);
}

// ══════════════════════════════════════════════════════════
// بناء المنتج المُرقّى
// ══════════════════════════════════════════════════════════
function buildRevivedProduct(old, identity, world, universe) {
  const template = loadTemplate();
  return {
    ...old,
    type:         'godot',
    templateFile: template?.templateFile || 'godot-wrapper.html',
    godotSlug:    old.slug,
    accent:       identity.accent         || universe.art?.accent   || old.accent,
    accentRgb:    universe.art?.accentRgb || old.accentRgb,
    gradient:     identity.gradient       || universe.art?.gradient || old.gradient,
    name:         identity.name           || old.name,
    desc:         identity.desc           || old.desc,
    revived:      true,
    revivedAt:    new Date().toISOString(),
    universeId:   universe.id,
    worldId:      world?.id   || null,
    concept:      identity.concept,
  };
}

// ══════════════════════════════════════════════════════════
// دوال مساعدة
// ══════════════════════════════════════════════════════════

function findClosestWorld(product, universe) {
  if (!universe.worlds?.length) return null;

  const keywords = [
    product.name?.en?.toLowerCase(),
    ...(product.tags || []),
    product.type?.toLowerCase(),
  ].filter(Boolean).join(' ');

  let best = universe.worlds[0];
  let bestScore = 0;

  for (const world of universe.worlds) {
    const worldText = [world.name?.en?.toLowerCase(), world.essence?.toLowerCase()]
      .filter(Boolean).join(' ');
    const score = keywords.split(' ')
      .filter(w => w.length > 3 && worldText.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = world; }
  }

  return best;
}

function loadAvailableRecipes() {
  if (!existsSync(RECIPES_DIR)) return [];
  try {
    const index = join(RECIPES_DIR, 'index.json');
    if (existsSync(index)) {
      return JSON.parse(readFileSync(index, 'utf8')).slice(0, 5);
    }
  } catch {}
  return [];
}

function loadProducts() {
  if (!existsSync(PRODUCTS_PATH)) return [];
  try { return JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8')); }
  catch { return []; }
}

// ══════════════════════════════════════════════════════════
// project.godot
// ══════════════════════════════════════════════════════════
function buildProjectGodot(slug, identity) {
  return `; Engine configuration file — Godot 4.6.2
config_version=5

[application]
config/name="${identity.name?.en || slug}"
run/main_scene="res://main_scene.tscn"
config/features=PackedStringArray("4.6", "Forward Plus")

[input]
move_forward={ "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":87,"physical_keycode":87,"key_label":87,"unicode":119,"echo":false)] }
move_back={    "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":83,"physical_keycode":83,"key_label":83,"unicode":115,"echo":false)] }
move_left={    "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":65,"physical_keycode":65,"key_label":65,"unicode":97,"echo":false)] }
move_right={   "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":68,"physical_keycode":68,"key_label":68,"unicode":100,"echo":false)] }
jump={         "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":32,"key_label":32,"unicode":32,"echo":false)] }
fire={         "deadzone": 0.5, "events": [Object(InputEventMouseButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"button_mask":1,"position":Vector2(0, 0),"global_position":Vector2(0, 0),"factor":1.0,"button_index":1,"canceled":false,"pressed":true,"double_click":false)] }

[rendering]
renderer/rendering_method="forward_plus"
`;
}

// ══════════════════════════════════════════════════════════
// export_presets.cfg
// ══════════════════════════════════════════════════════════
const EXPORT_PRESETS = `[preset.0]
name="Web"
platform="Web"
runnable=true
dedicated_server=false
custom_features=""
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path="./index.html"
patches=PackedStringArray()
encryption_include_filters=""
encryption_exclude_filters=""
encrypt_pck=false
encrypt_directory=false

[preset.0.options]
custom_template/debug=""
custom_template/release=""
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
progressive_web_app/background_color=Color(0, 0, 0, 1)
`;
