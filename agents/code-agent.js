import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { execSync }       from 'child_process';
import { askGemini }      from './_gemini.js';
import { soulContext }    from './_soul.js';
import { logger }         from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(idea, story, levels, art, templateData) {

  // ════════════════════════════════════════
  // ✅ مسار Godot
  // ════════════════════════════════════════
  if (idea.type === 'godot') {
    return handleGodotGame(idea, story, levels, art);
  }

  // ════════════════════════════════════════
  // مسار Phaser/HTML — كما هو تماماً
  // ════════════════════════════════════════
  // ... باقي الكود الموجود بدون تغيير ...
}

// ── مسار Godot الكامل ────────────────────
async function handleGodotGame(idea, story, worlds, art) {
  logger.info('Building Godot game', { id: idea.id });

  const projectDir = join(__dirname, '..', 'godot-projects', idea.id);
  mkdirSync(projectDir, { recursive: true });

  const soul = soulContext('godotAgent');

  // توليد GDScript
  const scripts = await generateScripts(idea, story, worlds, soul);
  if (!scripts) throw new Error('GDScript generation failed');

  // توليد .tscn
  const scenes = await generateScenes(idea, worlds, scripts);
  if (!scenes) throw new Error('Scene generation failed');

  // كتابة الملفات
  writeGodotFiles(projectDir, idea, scripts, scenes, worlds, art);

  // إضافة اللعبة لـ products.json
  addToProducts(idea, art, worlds);

  logger.info('Godot game built', { id: idea.id, dir: projectDir });
  return { success: true, id: idea.id, template: 'godot-wrapper.html' };
}

// ── توليد GDScript ───────────────────────
async function generateScripts(idea, story, worlds, soul) {
  try {
    const raw = await askGemini(`
${soul}

اكتب GDScript كامل لـ Godot 4.6.2 لهذه اللعبة.
الاسم: "${idea.name?.en}"
${story ? `البطل: ${story.mainCharacter?.name}` : ''}
${worlds ? `العوالم: ${worlds.worlds?.map(w => w.name?.en).join(', ')}` : ''}

القواعد الصارمة:
- tabs للـ indentation فقط
- preload() للمراجع الثابتة
- add_to_group("player") في player.gd
- add_to_group("enemy") في enemy.gd
- is_inside_tree() قبل queue_free() بعد await
- process_mode = ALWAYS في main_scene.gd
- دعم InputEventScreenTouch مع InputEventMouseButton

أنتج JSON فقط:
{
  "main_scene.gd": "...",
  "player.gd":     "...",
  "enemy.gd":      "...",
  "weapon.gd":     "...",
  "bullet.gd":     "..."
}`, 0.7, { topP: 0.9, maxOutputTokens: 8192 });

    // قواعد آلية
    const required = ['main_scene.gd','player.gd','enemy.gd','weapon.gd','bullet.gd'];
    for (const f of required) if (!raw[f]) throw new Error(`${f} مفقود`);

    for (const [name, code] of Object.entries(raw)) {
      raw[name] = applyScriptRules(name, code);
    }

    return raw;
  } catch (err) {
    logger.error('Script generation failed', { error: err.message });
    return null;
  }
}

// ── توليد .tscn ──────────────────────────
async function generateScenes(idea, worlds, scripts) {
  try {
    const raw = await askGemini(`
ابنِ ملفات .tscn لـ Godot 4.6.2.
المشروع: "${idea.id}"
الملفات المتوفرة: ${Object.keys(scripts).join(', ')}

القواعد الصارمة:
- load_steps = عدد ext_resource + عدد sub_resource بالضبط
- current = true في Camera3D
- contact_monitor = true + max_contacts_reported = 1 في bullet
- connection signal body_entered في bullet.tscn
- collision_mask = 3 للعدو
- gravity_scale = 0.0 في bullet
- process_mode = 3 في MainScene

أنتج JSON فقط:
{
  "main_scene.tscn": "...",
  "player.tscn":     "...",
  "enemy.tscn":      "...",
  "weapon.tscn":     "...",
  "bullet.tscn":     "..."
}`, 0.5, { maxOutputTokens: 8192 });

    for (const [name, content] of Object.entries(raw)) {
      raw[name] = fixLoadSteps(content);
    }

    return raw;
  } catch (err) {
    logger.error('Scene generation failed', { error: err.message });
    return null;
  }
}

// ── كتابة الملفات ────────────────────────
function writeGodotFiles(dir, idea, scripts, scenes, worlds, art) {
  // GDScript
  for (const [name, code] of Object.entries(scripts)) {
    writeFileSync(join(dir, name), code, 'utf8');
  }
  // .tscn
  for (const [name, content] of Object.entries(scenes)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  // project.godot
  writeFileSync(join(dir, 'project.godot'), buildProjectGodot(idea), 'utf8');
  // export_presets.cfg
  writeFileSync(join(dir, 'export_presets.cfg'), EXPORT_PRESETS, 'utf8');
  // worlds.json — للاستخدام في المستقبل
  if (worlds) {
    writeFileSync(join(dir, 'worlds.json'), JSON.stringify(worlds, null, 2), 'utf8');
  }
  logger.info('Godot files written', { dir, files: Object.keys(scripts).length + Object.keys(scenes).length });
}

// ── إضافة اللعبة لـ products.json ────────
function addToProducts(idea, art, worlds) {
  const path     = join(__dirname, '..', 'products.json');
  const products = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];

  if (products.find(p => p.id === idea.id)) {
    logger.info('Product already exists', { id: idea.id });
    return;
  }

  products.unshift({
    id:           idea.id,
    slug:         idea.id,
    type:         'godot',
    category:     'game',
    status:       'available',
    emoji:        idea.emoji,
    templateFile: 'godot-wrapper.html',
    godotSlug:    idea.id,
    accent:       art?.accent    || '#00ff88',
    accentRgb:    art?.accentRgb || '0,255,136',
    gradient:     art?.gradient  || '135deg,#020209,#080820',
    name:         idea.name,
    desc:         idea.desc,
    tags:         idea.tags || [],
    iap:          [],
    levels:       worlds?.worlds?.map(w => ({
      id:         w.id,
      name:       w.name,
      difficulty: w.difficulty,
    })) || [],
    controls: {
      ar: { move:'WASD للتحرك', look:'الفأرة للنظر', fire:'كليك يسار', jump:'مسافة' },
      en: { move:'WASD to move', look:'Mouse to look', fire:'Left click', jump:'Space' },
    },
    generated:   true,
    generatedAt: new Date().toISOString(),
  });

  writeFileSync(path, JSON.stringify(products, null, 2), 'utf8');
  logger.info('Product added to products.json', { id: idea.id });
}

// ── قواعد GDScript الآلية ─────────────────
function applyScriptRules(filename, code) {
  code = code.replace(/^    /gm, '\t').replace(/^  /gm, '\t');

  if (code.includes('await') && code.includes('queue_free()') && !code.includes('is_inside_tree')) {
    code = code.replace(/(\tqueue_free\(\))/g, '\tif is_inside_tree():\n\t\tqueue_free()');
  }
  if (filename === 'player.gd' && !code.includes('add_to_group("player")')) {
    code = code.replace('func _ready():\n', 'func _ready():\n\tadd_to_group("player")\n');
  }
  if (filename === 'enemy.gd' && !code.includes('add_to_group("enemy")')) {
    code = code.replace('func _ready():\n', 'func _ready():\n\tadd_to_group("enemy")\n');
  }
  return code;
}

// ── إصلاح load_steps ─────────────────────
function fixLoadSteps(content) {
  const ext = (content.match(/^\[ext_resource /gm) || []).length;
  const sub = (content.match(/^\[sub_resource /gm) || []).length;
  return content.replace(/\[gd_scene load_steps=\d+/, `[gd_scene load_steps=${ext + sub}`);
}

// ── project.godot ────────────────────────
function buildProjectGodot(idea) {
  return `; Engine configuration file.
config_version=5

[application]
config/name="${idea.name?.en || idea.id}"
run/main_scene="res://main_scene.tscn"
config/features=PackedStringArray("4.6", "Forward Plus")

[input]
move_forward={ "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":87,"physical_keycode":87,"key_label":87,"unicode":119,"echo":false)] }
move_back={    "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":83,"physical_keycode":83,"key_label":83,"unicode":115,"echo":false)] }
move_left={    "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":65,"physical_keycode":65,"key_label":65,"unicode":97,"echo":false)]  }
move_right={   "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":68,"physical_keycode":68,"key_label":68,"unicode":100,"echo":false)] }
jump={         "deadzone": 0.5, "events": [Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":32,"physical_keycode":32,"key_label":32,"unicode":32,"echo":false)]  }
fire={         "deadzone": 0.5, "events": [Object(InputEventMouseButton,"resource_local_to_scene":false,"resource_name":"","device":-1,"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"button_mask":1,"position":Vector2(0, 0),"global_position":Vector2(0, 0),"factor":1.0,"button_index":1,"canceled":false,"pressed":true,"double_click":false)] }
`;
}

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
encryption_include_filter=""
encryption_exclude_filter=""
encrypt_pck=false
encrypt_directory=false

[preset.0.options]
custom_template/debug=""
custom_template/release=""
variant/extensions_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/custom_html_shell=""
html/head_include=""
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
html/experimental_virtual_keyboard=false
progressive_web_app/enabled=false
`;
