extends Node

@export var world_environment_node: WorldEnvironment
@export_range(0.0, 1.0, 0.01) var memory_coherence: float = 1.0:
	set(value):
		memory_coherence = clamp(value, 0.0, 1.0)
		_update_bleed_effects()

const POST_PROCESS_SHADER_CODE = """
shader_type canvas_item;

uniform float memory_coherence : hint_range(0.0, 1.0) = 1.0;
uniform sampler2D screen_texture : hint_screen_texture;

void fragment() {
	vec4 color = texture(screen_texture, SCREEN_UV);

	// Desaturation effect: as coherence drops, desaturate
	float desaturation_factor = 1.0 - memory_coherence; // 0.0 (full color) to 1.0 (grayscale)
	float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	color.rgb = mix(color.rgb, vec3(luma), desaturation_factor);

	// Blurring/Noise effect: as coherence drops, add blur/noise
	// Simple blur approximation: sample neighbors
	float blur_intensity = (1.0 - memory_coherence) * 0.005; // Max blur amount
	vec2 offset = blur_intensity * TEXTURE_PIXEL_SIZE;
	vec4 blurred_color = texture(screen_texture, SCREEN_UV + vec2(offset.x, 0.0));
	blurred_color += texture(screen_texture, SCREEN_UV - vec2(offset.x, 0.0));
	blurred_color += texture(screen_texture, SCREEN_UV + vec2(0.0, offset.y));
	blurred_color += texture(screen_texture, SCREEN_UV - vec2(0.0, offset.y));
	blurred_color /= 5.0; // Original + 4 samples

	color.rgb = mix(color.rgb, blurred_color.rgb, desaturation_factor * 0.5); // Mix in blur

	// Add some subtle noise/grain as coherence drops
	float noise_amount = (1.0 - memory_coherence) * 0.1;
	vec3 noise = vec3(fract(sin(dot(SCREEN_UV.xy, vec2(12.9898, 78.233))) * 43758.5453));
	color.rgb += (noise - 0.5) * noise_amount;

	COLOR = color;
}
"""

var _post_process_shader_material: ShaderMaterial

func _ready() -> void:
	if not world_environment_node:
		push_error("WorldEnvironment node not assigned to MemoryBleedManager.")
		set_process(false)
		return

	_initialize_shaders()
	_update_bleed_effects()

func _initialize_shaders() -> void:
	_post_process_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = POST_PROCESS_SHADER_CODE
	_post_process_shader_material.shader = shader
	world_environment_node.environment.adjustment_shader = _post_process_shader_material
	world_environment_node.environment.adjustment_enabled = true

func _update_bleed_effects() -> void:
	if not world_environment_node or not _post_process_shader_material:
		return

	# Update WorldEnvironment Volumetric Fog
	var fog_density_max = 0.1 # Max density when memory_coherence is 0
	var fog_albedo_desat_factor = 0.8 # How much fog albedo desaturates
	var fog_emission_strength = 0.05 # How much emission contributes to the 'void' feel

	world_environment_node.environment.volumetric_fog_density = (1.0 - memory_coherence) * fog_density_max
	world_environment_node.environment.volumetric_fog_albedo = Color(1.0, 1.0, 1.0).lerp(Color(0.5, 0.5, 0.5), (1.0 - memory_coherence) * fog_albedo_desat_factor)
	world_environment_node.environment.volumetric_fog_emission = Color(0.0, 0.0, 0.0).lerp(Color(0.1, 0.1, 0.1), (1.0 - memory_coherence) * fog_emission_strength)

	# Update post-processing shader uniform
	_post_process_shader_material.set_shader_parameter("memory_coherence", memory_coherence)
