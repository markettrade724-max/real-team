/**
 * code-agent.js — يبني هيكل المشروع البرمجي الكامل
 * 
 * المسؤوليات:
 *  - توليد project.godot
 *  - توليد كل ملفات .gd و .tscn
 *  - توليد export_presets.cfg
 *  - كتابة الملفات إلى godot-projects/<slug>/
 * 
 * القواعد المطبقة:
 *  - rule-088: استدعاء askGemini(prompt, temperature, options)
 *  - rule-057: قراءة soulContext('codeAgent')
 *  - rule-058: اسم preset = 'Web' دائماً
 *  - rule-061: لا إيموجي في السجلات
 *  - rule-089: كل الردود JSON لأن _gemini.js يستخدم responseMimeType: 'application/json'
 *  - rule-099: استدعاء askGemini من _gemini.js فقط
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { askGemini } from './_gemini.js';
import { soulContext } from './_soul.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function writeProjectFile(slug, filename, content) {
    const dir = join(__dirname, '..', 'godot-projects', slug);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filePath = join(dir, filename);
    writeFileSync(filePath, content, 'utf8');
    logger.info(`[OK] Written: ${slug}/${filename}`);
}

function generateExportPresets() {
    return `[preset.0]
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
progressive_web_app/offline_page=""
progressive_web_app/display=1
progressive_web_app/orientation=0
progressive_web_app/icon_144x144=""
progressive_web_app/icon_180x180=""
progressive_web_app/icon_512x512=""
progressive_web_app/background_color=Color(0, 0, 0, 1)
`;
}

export async function run(idea, story, levels, art, template, isGodot = true) {
    logger.info('[INFO] Code Agent started', { id: idea.id, type: idea.type });

    if (!isGodot) {
        logger.info('[INFO] Non-Godot project — skipping code generation');
        return { slug: idea.id, files: [], engine: 'phaser' };
    }

    const soul = soulContext('codeAgent');
    const slug = idea.id;
    const files = [];

    // 1. export_presets.cfg
    const presetsContent = generateExportPresets();
    writeProjectFile(slug, 'export_presets.cfg', presetsContent);
    files.push('export_presets.cfg');

    // 2. project.godot (يُطلب JSON دائماً)
    const projectPrompt = `${soul}
Create a Godot 4.6.2 project.godot file for a ${idea.type} game named "${idea.name?.en}".
Genre: ${idea.genre || 'action'}
Main scene: res://main_scene.tscn
Features: 4.6, Forward Plus
Inputs: move_forward (W), move_back (S), move_left (A), move_right (D), jump (Space), fire (Mouse1), ui_cancel (Escape)

Return ONLY a JSON object: { "content": "<complete project.godot here>" }`;

    try {
        const result = await askGemini(projectPrompt, 0.3, { topP: 0.9, maxOutputTokens: 8192 });
        if (result && typeof result.content === 'string') {
            writeProjectFile(slug, 'project.godot', result.content);
            files.push('project.godot');
        } else {
            logger.error('[ERROR] project.godot generation returned invalid structure');
            throw new Error('Invalid project.godot JSON');
        }
    } catch (e) {
        logger.error('[ERROR] Failed to generate project.godot', e.message);
        throw e;
    }

    // 3. ملفات المشهد والسكريبتات
    const scenesPrompt = `${soul}
Create the core game files for a 3D first-person shooter called "${idea.name?.en}".
It must contain: a main scene with ground, lighting, player (CharacterBody3D), camera, and weapon.
Include GDScript files for Player, Weapon, and Bullet (RigidBody3D).
The player moves with WASD, jumps with Space, shoots with mouse click.
Use ONLY lowercase filenames: main_scene.tscn, main_scene.gd, player.tscn, player.gd, weapon.tscn, weapon.gd, bullet.tscn, bullet.gd.

Return a JSON object with keys being the filename and values being the COMPLETE file content as strings.
Format: { "main_scene.tscn": "...", "main_scene.gd": "...", "player.tscn": "...", ... }`;

    try {
        const parsed = await askGemini(scenesPrompt, 0.5, { topP: 0.9, maxOutputTokens: 8192 });
        // _gemini.js يُعيد الكائن مباشرة — لا حاجة لـ JSON.parse
        for (const [filename, content] of Object.entries(parsed)) {
            if (typeof content === 'string' && content.trim().length > 0) {
                writeProjectFile(slug, filename, content);
                files.push(filename);
            }
        }
    } catch (e) {
        logger.error('[ERROR] Failed to generate scene files', e.message);
    }

    logger.info('[OK] Code Agent finished', { slug, files: files.length });
    return { slug, files, engine: 'godot' };
}
