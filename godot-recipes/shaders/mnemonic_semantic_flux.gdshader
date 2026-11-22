shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D texture_stable_albedo : source_color;
uniform sampler2D texture_stable_normal : hint_normal;
uniform sampler2D texture_corrupted_albedo : source_color;
uniform sampler2D texture_corrupted_normal : hint_normal;
uniform sampler2D texture_memory_albedo : source_color;
uniform sampler2D texture_memory_normal : hint_normal;

uniform sampler2D displacement_noise_texture; // Grayscale noise for vertex displacement

uniform float blend_corrupted : hint_range(0.0, 1.0) = 0.0;
uniform float blend_memory : hint_range(0.0, 1.0) = 0.0;
uniform float unravel_strength : hint_range(0.0, 1.0) = 0.0;
uniform float unravel_speed : hint_range(0.1, 5.0) = 1.0;
uniform float uv_distortion_strength : hint_range(0.0, 0.1) = 0.0;

void vertex() {
	// Base UV for sampling
	vec2 base_uv = UV;

	// UV distortion based on time and strength
	vec2 distortion_offset = sin(base_uv * 10.0 + TIME * unravel_speed) * uv_distortion_strength;
	base_uv += distortion_offset;

	// Vertex displacement using noise texture, scaled by unravel_strength
	vec4 noise_sample = texture(displacement_noise_texture, base_uv * unravel_speed * 0.5 + TIME * 0.05);
	vec3 displacement_vector = (noise_sample.rgb - 0.5) * 2.0; // Range -1 to 1
	VERTEX += NORMAL * displacement_vector * unravel_strength;

	// Pass distorted UV to fragment shader
	UV = base_uv;
}

void fragment() {
	// Sample albedo textures with the (potentially) distorted UV
	vec4 stable_albedo = texture(texture_stable_albedo, UV);
	vec4 corrupted_albedo = texture(texture_corrupted_albedo, UV);
	vec4 memory_albedo = texture(texture_memory_albedo, UV);

	// Sample normal textures
	vec3 stable_normal = texture(texture_stable_normal, UV).rgb;
	vec3 corrupted_normal = texture(texture_corrupted_normal, UV).rgb;
	vec3 memory_normal = texture(texture_memory_normal, UV).rgb;

	// Blend albedo states sequentially
	vec4 final_albedo = mix(stable_albedo, corrupted_albedo, blend_corrupted);
	final_albedo = mix(final_albedo, memory_albedo, blend_memory);

	// Blend normal maps sequentially
	vec3 final_normal = mix(stable_normal, corrupted_normal, blend_corrupted);
	final_normal = mix(final_normal, memory_normal, blend_memory);

	ALBEDO = final_albedo.rgb;
	NORMAL_MAP = final_normal;
	NORMAL_MAP_ENABLED = true; // Ensure normal map is applied
	ROUGHNESS = 0.8; // Example default, can be made a uniform if needed
	METALLIC = 0.0;  // Example default, can be made a uniform if needed
}
