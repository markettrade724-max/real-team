extends Control

@export_range(0.0, 1.0, 0.01) var initial_distortion_strength: float = 0.1
@export_range(0.0, 1.0, 0.01) var max_distortion_strength: float = 0.8
@export var stabilization_duration: float = 5.0 # How long the shard stays clear
@export var attack_interval_min: float = 10.0 # Min time between Silence attacks
@export var attack_interval_max: float = 20.0 # Max time between Silence attacks
@export var stabilization_input_threshold: float = 100.0 # Mouse movement needed to stabilize
@export var distortion_increase_on_attack: float = 0.3

signal shard_stabilized
signal shard_destabilized

var _current_distortion_strength: float = 0.0
var _is_stabilized: bool = false
var _stabilization_timer: Timer
var _attack_timer: Timer
var _current_input_accum: float = 0.0
var _shader_material: ShaderMaterial
var _texture_rect: TextureRect

const SHADER_CODE = """
shader_type canvas_item;

uniform float distortion_strength : hint_range(0.0, 1.0) = 0.0;
uniform float time : hint_range(0.0, 100.0) = 0.0;
uniform sampler2D noise_texture : hint_filter_linear_mipmap;
uniform vec2 ghosting_offset = vec2(0.005, 0.005);

void fragment() {
	vec2 uv = SCREEN_UV;
	vec4 original_color = texture(SCREEN_TEXTURE, uv);

	// Noise-based distortion
	vec2 noise_uv = uv * 5.0 + vec2(time * 0.1, time * 0.05);
	vec4 noise = texture(noise_texture, noise_uv);
	vec2 distorted_uv = uv + (noise.rg - 0.5) * distortion_strength * 0.05;

	// Chromatic aberration / color shift
	vec4 color_r = texture(SCREEN_TEXTURE, distorted_uv + vec2(distortion_strength * 0.005, 0.0));
	vec4 color_g = texture(SCREEN_TEXTURE, distorted_uv);
	vec4 color_b = texture(SCREEN_TEXTURE, distorted_uv - vec2(distortion_strength * 0.005, 0.0));

	vec4 final_color = vec4(color_r.r, color_g.g, color_b.b, original_color.a);

	// Ghosting effect
	vec4 ghost_color = texture(SCREEN_TEXTURE, uv + ghosting_offset * distortion_strength);
	final_color = mix(final_color, ghost_color, distortion_strength * 0.5);

	// Overall flicker/noise overlay
	float flicker = texture(noise_texture, uv * 10.0 + time * 0.2).r;
	final_color.rgb += (flicker - 0.5) * distortion_strength * 0.2;

	COLOR = mix(original_color, final_color, distortion_strength);
}
"""

func _ready() -> void:
	# Ensure a SubViewportContainer and TextureRect are children
	var sub_viewport_container = get_node_or_null("SubViewportContainer")
	if not sub_viewport_container:
		printerr("Error: Missing SubViewportContainer child.")
		set_process(false)
		return

	var sub_viewport = sub_viewport_container.get_node_or_null("SubViewport")
	if not sub_viewport:
		printerr("Error: Missing SubViewport child.")
		set_process(false)
		return

	_texture_rect = sub_viewport_container.get_node_or_null("TextureRect")
	if not _texture_rect:
		printerr("Error: Missing TextureRect child.")
		set_process(false)
		return

	# Create and assign shader material
	_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = SHADER_CODE
	_shader_material.shader = shader

	# Load a default noise texture if not set (for demonstration)
	var noise_texture = preload("res://icon.svg") # Replace with a proper noise texture
	_shader_material.set_shader_parameter("noise_texture", noise_texture)

	_texture_rect.material = _shader_material

	# Set up timers
	_stabilization_timer = Timer.new()
	add_child(_stabilization_timer)
	_stabilization_timer.one_shot = true
	_stabilization_timer.timeout.connect(Callable(self, "_on_stabilization_timer_timeout"))

	_attack_timer = Timer.new()
	add_child(_attack_timer)
	_attack_timer.one_shot = true
	_attack_timer.timeout.connect(Callable(self, "_on_attack_timer_timeout"))

	_current_distortion_strength = initial_distortion_strength
	_start_attack_timer()

func _process(delta: float) -> void:
	_current_distortion_strength = lerp(_current_distortion_strength, initial_distortion_strength, delta * 0.5)
	_current_distortion_strength = clamp(_current_distortion_strength, 0.0, max_distortion_strength)

	_shader_material.set_shader_parameter("distortion_strength", _current_distortion_strength)
	_shader_material.set_shader_parameter("time", Time.get_ticks_msec() / 1000.0)

	# Decay input accumulation
	if _current_input_accum > 0:
		_current_input_accum = max(0.0, _current_input_accum - delta * 50.0)

func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_current_input_accum += event.relative.length()
		if not _is_stabilized and _current_input_accum >= stabilization_input_threshold:
			stabilize_shard()
			_current_input_accum = 0.0 # Reset after stabilization

func _start_attack_timer() -> void:
	var random_interval = randf_range(attack_interval_min, attack_interval_max)
	_attack_timer.start(random_interval)

func _on_attack_timer_timeout() -> void:
	if not _is_stabilized:
		_current_distortion_strength = min(max_distortion_strength, _current_distortion_strength + distortion_increase_on_attack)
		# Potentially trigger false data display here in a more complex implementation
	_start_attack_timer()

func _on_stabilization_timer_timeout() -> void:
	destabilize_shard()

func stabilize_shard() -> void:
	if _is_stabilized: return
	_is_stabilized = true
	_current_distortion_strength = 0.0 # Clear distortion
	_stabilization_timer.start(stabilization_duration)
	_attack_timer.stop() # Pause attacks while stabilized
	emit shard_stabilized()
	print("Cognitive Shard Stabilized!")

func destabilize_shard() -> void:
	if not _is_stabilized: return
	_is_stabilized = false
	_stabilization_timer.stop()
	_start_attack_timer() # Resume attacks
	emit shard_destabilized()
	print("Cognitive Shard Destabilized.")

# External API to influence distortion
func set_memory_integrity(value: float) -> void:
	# value: 0.0 (low integrity) to 1.0 (high integrity)
	_current_distortion_strength = lerp(max_distortion_strength, initial_distortion_strength, value)

func set_stress_level(value: float) -> void:
	# value: 0.0 (low stress) to 1.0 (high stress)
	_current_distortion_strength = lerp(initial_distortion_strength, max_distortion_strength, value)
