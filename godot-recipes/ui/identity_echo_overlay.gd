@tool
extends Control

# --- Exported Properties ---
@export_range(0.0, 1.0, 0.01) var identity_coherence: float = 1.0:
	set(value):
		identity_coherence = clampf(value, 0.0, 1.0)
		_update_shader_params()
@export_range(0.0, 1.0, 0.01) var silence_proximity: float = 0.0:
	set(value):
		silence_proximity = clampf(value, 0.0, 1.0)
		_update_shader_params()
@export var silence_eye_texture: Texture2D # Texture for Silence glimpses

# --- Node References ---
@onready var _viewport_container: ViewportContainer = %ViewportContainer
@onready var _sub_viewport: SubViewport = %SubViewport
@onready var _display_rect: TextureRect = %DisplayRect # This will have the shader

# --- Shader Code (GLSL for Godot 4.6.2) ---
const SHADER_CODE = """
shader_type canvas_item;

uniform sampler2D screen_texture; // This will be the ViewportTexture from _sub_viewport
uniform float identity_coherence; // 1.0 = clear, 0.0 = fully fragmented
uniform float silence_proximity;  // 0.0 = far, 1.0 = very close
uniform sampler2D silence_eye_texture; // Glimpses of the Silence
uniform float time;

void fragment() {
	vec2 uv = UV; // Use UV for sampling the TextureRect's texture
	vec4 color = texture(screen_texture, uv);

	// --- Identity Coherence Effects ---
	float distortion_amount = 1.0 - identity_coherence;

	// Simple chromatic aberration
	vec2 offset_r = vec2(sin(time * 5.0) * 0.002, cos(time * 4.0) * 0.002) * distortion_amount;
	vec2 offset_g = vec2(cos(time * 6.0) * 0.001, sin(time * 3.0) * 0.001) * distortion_amount;
	vec2 offset_b = vec2(sin(time * 7.0) * 0.003, cos(time * 5.0) * 0.003) * distortion_amount;

	color.r = texture(screen_texture, uv + offset_r).r;
	color.g = texture(screen_texture, uv + offset_g).g;
	color.b = texture(screen_texture, uv + offset_b).b;

	// Overall blur/pixelation based on distortion_amount
	float pixel_size = mix(0.0, 0.01, distortion_amount); // Max pixelation
	uv = round(uv / pixel_size) * pixel_size;
	color = mix(color, texture(screen_texture, uv), distortion_amount * 0.5); // Blend with pixelated version

	// --- Silence Proximity Effects ---
	if (silence_proximity > 0.0) {
		// Static/Noise
		float noise = fract(sin(dot(uv + time, vec2(12.9898, 78.233))) * 43758.5453);
		color.rgb = mix(color.rgb, vec3(noise), silence_proximity * 0.2); // Blend with static

		// Glimpses of Silence Eye
		if (silence_eye_texture != null) {
			float eye_blend_factor = smoothstep(0.5, 1.0, silence_proximity); // Only show eye at higher proximity
			vec2 eye_uv = uv * (1.0 + sin(time * 0.5) * 0.1) + vec2(cos(time * 0.3) * 0.1, sin(time * 0.4) * 0.1);
			vec4 eye_color = texture(silence_eye_texture, eye_uv);
			color = mix(color, eye_color, eye_blend_factor * 0.5); // Blend in eye texture
		}

		// Desaturation/Tinting
		float desaturation = silence_proximity * 0.5;
		color.rgb = mix(color.rgb, vec3(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722))), desaturation);
		color.rgb += vec3(0.0, 0.0, 0.05) * silence_proximity; // Slight blue tint
	}

	COLOR = color;
}
"""

# --- Member Variables ---
var _shader_material: ShaderMaterial

# --- Godot Lifecycle Methods ---
func _ready() -> void:
	_setup_shader()
	_update_shader_params()

func _process(delta: float) -> void:
	if _shader_material:
		_shader_material.set_shader_parameter("time", Time.get_ticks_msec() / 1000.0)

# --- Private Methods ---
func _setup_shader() -> void:
	_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = SHADER_CODE
	_shader_material.shader = shader
	_display_rect.material = _shader_material
	_display_rect.texture = _sub_viewport.get_texture() # Pass SubViewport's output to TextureRect

func _update_shader_params() -> void:
	if _shader_material:
		_shader_material.set_shader_parameter("identity_coherence", identity_coherence)
		_shader_material.set_shader_parameter("silence_proximity", silence_proximity)
		if silence_eye_texture:
			_shader_material.set_shader_parameter("silence_eye_texture", silence_eye_texture)

# --- Public API for Game Logic ---
func lose_memory(amount: float) -> void:
	identity_coherence -= amount
	identity_coherence = clampf(identity_coherence, 0.0, 1.0)

func gain_memory(amount: float) -> void:
	identity_coherence += amount
	identity_coherence = clampf(identity_coherence, 0.0, 1.0)

func update_silence_proximity(proximity: float) -> void:
	silence_proximity = proximity
	silence_proximity = clampf(silence_proximity, 0.0, 1.0)
