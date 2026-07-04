shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D albedo_ruined : source_color;
uniform sampler2D albedo_pristine : source_color;
uniform sampler2D normal_ruined : hint_normal;
uniform sampler2D normal_pristine : hint_normal;

uniform float memory_reveal_factor = 0.0; // 0.0 = ruined, 1.0 = pristine
uniform vec4 memory_glow_color : source_color = vec4(0.5, 0.8, 1.0, 1.0);
uniform float displacement_strength = 0.05;
uniform float glow_intensity = 2.0;
uniform float time_elapsed = 0.0;

void vertex() {
	vec3 displacement_offset = vec3(0.0);
	// Simple wave displacement, modulated by reveal factor
	displacement_offset.y = sin(VERTEX.x * 10.0 + time_elapsed * 5.0) * cos(VERTEX.z * 10.0 + time_elapsed * 5.0) * displacement_strength * memory_reveal_factor;
	VERTEX += displacement_offset;
}

void fragment() {
	vec4 ruined_albedo = texture(albedo_ruined, UV);
	vec4 pristine_albedo = texture(albedo_pristine, UV);
	ALBEDO = mix(ruined_albedo.rgb, pristine_albedo.rgb, memory_reveal_factor);

	vec3 ruined_normal = texture(normal_ruined, UV).rgb;
	vec3 pristine_normal = texture(normal_pristine, UV).rgb;
	NORMAL = mix(ruined_normal, pristine_normal, memory_reveal_factor);

	// Ephemeral glow, strongest during transition (memory_reveal_factor around 0.5)
	ALBEDO += memory_glow_color.rgb * glow_intensity * memory_reveal_factor * (1.0 - memory_reveal_factor);
}
