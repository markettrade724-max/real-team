/**
 * revival-agent.js — وكيل البعث
 *
 * يأخذ المنتجات القديمة الفارغة ويرقّيها إلى ألعاب Godot حقيقية
 * مشحونة بروح الكون الجديد.
 *
 * المبدأ: لا شيء يُحذف — كل شيء يُبعث.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname }  from 'path';
import { fileURLToPath }  from 'url';
import { askGemini }      from './_gemini.js';
import { soulContext }    from './_soul.js';
import { logger }         from '../logger.js';

const __dirname      = dirname(fileURLToPath(import.meta.url));
const PRODUCTS_PATH  = join(__dirname, '..', 'products.json');
const RECIPES_DIR    = join(__dirname, '..', 'godot-recipes');

const SKIP_TYPES  = ['godot'];
const MAX_PER_RUN = 3;

// ════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ════════════════════════════════════════════════════════════
export async function run(universe) {
  logger.info('[REVIVAL] Agent awakening — scanning old products...');

  const products = loadProducts();
  const soul     = soulContext('revivalAgent');

  if (!products.length) {
    logger.warn('[REVIVAL] No products found');
    return { revived: 0 };
  }

  if (!universe?.soul) {
    logger.warn('[REVIVAL] No universe soul — cannot revive without spirit');
    return { revived: 0 };
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
    logger.info(`[REVIVAL] Reviving: "${product.name?.en}"...`);
    try {
      const revived = await reviveProduct(product, universe, soul);
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
    writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf8');
    const publicPath = join(__dirname, '..', 'public', 'products.json');
    writeFileSync(publicPath, JSON.stringify(products, null, 2), 'utf8');
    logger.info('[OK] Revival complete', { revived: revivedCount });
  }

  return { revived: revivedCount, total: candidates.length };
}

// ════════════════════════════════════════════════════════════
// ترقية منتج واحد
// ════════════════════════════════════════════════════════════
async function reviveProduct(product, universe, soul) {
  const closestWorld = findClosestWorld(product, universe);
  const recipes      = loadAvailableRecipes();

  const newIdentity = await generateNewIdentity(product, universe, closestWorld, soul, recipes);
  if (!newIdentity) return null;

  const godotCode = await generateGodotCode(newIdentity, universe, closestWorld, soul, recipes);
  if (!godotCode) return null;

  writeGodotProject(product.slug, godotCode, newIdentity);

  return buildRevivedProduct(product, newIdentity, closestWorld, universe);
}

// ── توليد الهوية الجديدة ─────────────────
async function generateNewIdentity(product, universe, world, soul, recipes) {
  try {
    return await askGemini(`
${soul}

حوّل هذا المنتج إلى لعبة Godot 3D بروح الكون.

المنتج: "${product.name?.en}" — ${product.desc?.en?.slice(0, 80)}
روح الكون: "${universe.soul?.essence?.slice(0, 80)}"
العالم: "${world?.name?.en || 'العالم الأول'}"

أنتج JSON فقط:
{
  "concept": "جملة شاعرية قصيرة",
  "gameplay": "آلية اللعب في جملتين",
  "godotFeatures": ["ميزة 1", "ميزة 2"],
  "worldConnection": "جملة واحدة",
  "name": { "ar": "${product.name?.ar}", "en": "${product.name?.en}", "fr": "${product.name?.fr || product.name?.en}", "es": "${product.name?.es || product.name?.en}", "de": "${product.name?.de || product.name?.en}", "zh": "${product.name?.zh || product.name?.en}" },
  "desc": { "ar": "وصف قصير", "en": "Short description", "fr": "Description", "es": "Descripción", "de": "Beschreibung", "zh": "描述" },
  "accent": "${universe.art?.accent || '#00ff88'}",
  "gradient": "${universe.art?.gradient || '135deg,#020209,#080820'}"
}`, 0.9, { maxOutputTokens: 1024, topP: 0.95 });
  } catch (err) {
    logger.error('[ERROR] Identity generation failed', { error: err.message });
    return null;
  }
}

// ── توليد كود Godot ──────────────────────
async function generateGodotCode(identity, universe, world, soul, recipes) {
  try {
    return await askGemini(`
${soul}

اكتب GDScript كامل لـ Godot 4.6.2:

المفهوم: "${identity.concept}"
آلية اللعب: "${identity.gameplay}"
العالم: "${world?.name?.en || 'Unknown'}"

${recipes.length > 0 ? `وصفات متاحة:\n${recipes.slice(0,3).map(r => `- ${r.filename}: ${r.usage}`).join('\n')}` : ''}

القواعد:
- tabs للـ indentation
- add_to_group("player") في player.gd
- is_inside_tree() قبل queue_free() بعد await
- process_mode = ALWAYS في main_scene.gd
- دعم InputEventScreenTouch
- gravity_scale = 0.0 للرصاص

أنتج JSON فقط:
{
  "main_scene.gd": "...",
  "player.gd":     "...",
  "enemy.gd":      "...",
  "weapon.gd":     "...",
  "bullet.gd":     "..."
}`, 0.7, { maxOutputTokens: 8192, topP: 0.9 });
  } catch (err) {
    logger.error('[ERROR] Godot code generation failed', { error: err.message });
    return null;
  }
}

// ── كتابة ملفات المشروع ──────────────────
function writeGodotProject(slug, scripts, identity) {
  const projectDir = join(__dirname, '..', 'godot-projects', slug);
  mkdirSync(projectDir, { recursive: true });

  for (const [filename, code] of Object.entries(scripts)) {
    if (typeof code === 'string' && code.trim()) {
      writeFileSync(join(projectDir, filename), code, 'utf8');
    }
  }

  writeFileSync(join(projectDir, 'project.godot'), buildProjectGodot(slug, identity), 'utf8');
  writeFileSync(join(projectDir, 'export_presets.cfg'), EXPORT_PRESETS, 'utf8');

  logger.info(`[OK] Godot project written: ${slug}`);
}

// ── بناء المنتج المُرقّى ─────────────────
function buildRevivedProduct(old, identity, world, universe) {
  return {
    ...old,
    type:         'godot',
    templateFile: 'godot-wrapper.html',
    godotSlug:    old.slug,
    accent:       identity.accent        || universe.art?.accent    || old.accent,
    accentRgb:    universe.art?.accentRgb || old.accentRgb,
    gradient:     identity.gradient      || universe.art?.gradient  || old.gradient,
    name:         identity.name          || old.name,
    desc:         identity.desc          || old.desc,
    revived:      true,
    revivedAt:    new Date().toISOString(),
    universeId:   universe.id,
    worldId:      world?.id || null,
    concept:      identity.concept,
  };
}

// ── اختيار أقرب عالم ────────────────────
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
    const worldText = [world.name?.en?.toLowerCase(), world.desc?.en?.toLowerCase()]
      .filter(Boolean).join(' ');
    const score = keywords.split(' ')
      .filter(w => w.length > 3 && worldText.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = world; }
  }

  return best;
}

// ── تحميل الوصفات ────────────────────────
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

// ── تحميل المنتجات ───────────────────────
function loadProducts() {
  if (!existsSync(PRODUCTS_PATH)) return [];
  try { return JSON.parse(readFileSync(PRODUCTS_PATH, 'utf8')); }
  catch { return []; }
}

// ── project.godot ────────────────────────
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

// ── export_presets.cfg ───────────────────
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
