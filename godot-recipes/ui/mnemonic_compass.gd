extends TextureRect

## Manages the visual erosion and fading of the compass based on Lyra's identity and proximity to the Silence.
## This script should be attached to a TextureRect node that displays the compass graphic.

const SHADER_CODE = """
shader_type canvas_item;

uniform float identity_cohesion : hint_range(0.0, 1.0) = 1.0;
uniform float silence_proximity : hint_range(0.0, 1.0) = 0.0;
uniform float time_elapsed = 0.0;
uniform float memory_loss_effect : hint_range(0.0, 1.0) = 0.0;
uniform float memory_loss_seed = 0.0;

// Simple pseudo-random noise function
float rand(vec2 co) {
	return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 ip = floor(p);
	vec2 fp = fract(p);
	fp = fp * fp * (3.0 - 2.0 * fp); // Smoothstep interpolation
	float bl = rand(ip);
	float br = rand(ip + vec2(1.0, 0.0));
	float tl = rand(ip + vec2(0.0, 1.0));
	float tr = rand(ip + vec2(1.0, 1.0));
	return mix(mix(bl, br, fp.x), mix(tl, tr, fp.x), fp.y);
}

void fragment() {
	vec2 uv = UV;

	// Dynamic distortion based on silence proximity
	float dynamic_distortion_strength = silence_proximity * 0.08; // Adjust strength
	vec2 noise_uv_dynamic = uv * 10.0 + time_elapsed * 0.5;
	vec2 dynamic_distortion = vec2(noise(noise_uv_dynamic), noise(noise_uv_dynamic + vec2(100.0, 0.0))) * 2.0 - 1.0;
	uv += dynamic_distortion * dynamic_distortion_strength;

	// Permanent distortion from memory loss
	float static_distortion_strength = memory_loss_effect * 0.04; // Adjust strength
	vec2 noise_uv_static = uv * 5.0 + memory_loss_seed * 10.0; // Use seed for unique pattern
	vec2 static_distortion = vec2(noise(noise_uv_static), noise(noise_uv_static + vec2(50.0, 0.0))) * 2.0 - 1.0;
	uv += static_distortion * static_distortion_strength;

	vec4 color = texture(TEXTURE, uv);

	// Fade based on identity cohesion
	color.a *= identity_cohesion;

	COLOR = color;
}
"""

@export_range(0.0, 1.0, 0.01) var initial_identity_cohesion: float = 1.0:
	set(value):
		initial_identity_cohesion = clampf(value, 0.0, 1.0)
		_update_shader_cohesion(initial_identity_cohesion)

@export_range(0.0, 1.0, 0.01) var initial_silence_proximity: float = 0.0:
	set(value):
		initial_silence_proximity = clampf(value, 0.0, 1.0)
		_update_shader_proximity(initial_silence_proximity)

@export var rotation_speed: float = 5.0 ## Speed at which the compass rotates to target.

var _shader_material: ShaderMaterial
var _current_time: float = 0.0
var _target_rotation_rad: float = 0.0

func _ready() -> void:
	_setup_shader()
	_update_shader_cohesion(initial_identity_cohesion)
	_update_shader_proximity(initial_silence_proximity)

func _process(delta: float) -> void:
	_current_time += delta
	if _shader_material:
		_shader_material.set_shader_parameter("time_elapsed", _current_time)
	
	# Smoothly rotate the compass to the target direction
	rotation = lerp_angle(rotation, _target_rotation_rad, delta * rotation_speed)

func _setup_shader() -> void:
	_shader_material = ShaderMaterial.new()
	var shader_res = Shader.new()
	shader_res.code = SHADER_CODE
	_shader_material.shader = shader_res
	material = _shader_material

func set_identity_cohesion(value: float, duration: float = 0.5) -> void:
	var clamped_value = clampf(value, 0.0, 1.0)
	if _shader_material:
		var tween = create_tween()
		tween.tween_method(Callable(self, "_update_shader_cohesion"), _shader_material.get_shader_parameter("identity_cohesion"), clamped_value, duration)

func set_silence_proximity(value: float, duration: float = 0.5) -> void:
	var clamped_value = clampf(value, 0.0, 1.0)
	if _shader_material:
		var tween = create_tween()
		tween.tween_method(Callable(self, "_update_shader_proximity"), _shader_material.get_shader_parameter("silence_proximity"), clamped_value, duration)

func set_target_direction(direction: Vector2) -> void:
	# Adjust for a compass texture that typically points upwards (negative Y axis).
	# Vector2.angle() returns the angle with the positive X axis.
	_target_rotation_rad = direction.angle() + PI / 2.0

func lose_memory_fragment(fragment_id: String) -> void:
	# This simulates a permanent memory loss effect.
	# The 'fragment_id' could be used to generate a unique seed for the distortion,
	# but for simplicity, we'll just apply a generic permanent effect.
	if _shader_material:
		_shader_material.set_shader_parameter("memory_loss_effect", 1.0)
		# Use a random value for a unique static distortion pattern
		_shader_material.set_shader_parameter("memory_loss_seed", randf() * 1000.0)

func _update_shader_cohesion(value: float) -> void:
	if _shader_material:
		_shader_material.set_shader_parameter("identity_cohesion", value)

func _update_shader_proximity(value: float) -> void:
	if _shader_material:
		_shader_material.set_shader_parameter("silence_proximity", value)
