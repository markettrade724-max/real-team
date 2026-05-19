// ✅ إصلاح: توحيد اسم preset على "Web" في كل مكان
// كان: name="HTML5" — أصبح: name="Web"
// السبب: godot-export.yml يبحث عن --export-release "Web"

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
progressive_web_app/offline_page=""
progressive_web_app/display=1
progressive_web_app/orientation=0
progressive_web_app/icon_144x144=""
progressive_web_app/icon_180x180=""
progressive_web_app/icon_maskable_192x512=""
progressive_web_app/icon_maskable_512x512=""
progressive_web_app/background_color=Color(0, 0, 0, 1)
`;
