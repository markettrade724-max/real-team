shader_type spatial;

render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D texture_albedo : source_color;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float roughness : hint_range(0.0, 1.0) = 1.0;
uniform vec3 emission : source_color = vec3(0.0);
uniform float emission_energy : hint_range(0.0, 16.0) = 1.0;

uniform vec3 void_center = vec3(0.0);
uniform float void_radius = 5.0;
uniform float void_falloff = 2.0;
uniform float void_strength : hint_range(0.0, 1.0) = 1.0;
uniform vec4 void_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform vec3 void_emission_color : source_color = vec3(0.1, 0.0, 0.2);
uniform float void_emission_energy : hint_range(0.0, 16.0) = 2.0;
uniform float void_distortion_scale : hint_range(0.0, 1.0) = 0.1;
uniform float void_distortion_speed : hint_range(0.0, 10.0) = 1.0;

void vertex() {
	vec3 world_vertex = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float dist = distance(world_vertex, void_center);
	// void_factor is 1.0 deep inside the void, 0.0 outside the void_radius
	float void_factor = smoothstep(void_radius, void_radius - void_falloff, dist);

	if (void_factor > 0.0) {
		// Apply distortion to vertices, scaled by void_factor and void_strength
		vec3 distortion_offset = NORMAL * sin(TIME * void_distortion_speed + dot(world_vertex, vec3(1.2, 3.4, 5.6))) * void_distortion_scale * void_factor * void_strength;
		VERTEX += distortion_offset;
	}
}

void fragment() {
	// Recalculate world_vertex as it might have been modified in the vertex shader
	vec3 world_vertex = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float dist = distance(world_vertex, void_center);
	// void_factor is 1.0 deep inside the void, 0.0 outside the void_radius
	float void_factor = smoothstep(void_radius, void_radius - void_falloff, dist);

	// Original material properties
	vec4 base_albedo_tex = texture(texture_albedo, UV);
	vec4 base_albedo = base_albedo_tex * albedo;
	vec3 base_emission = emission * emission_energy;

	// Void material properties
	vec4 void_mat_albedo = void_color;
	vec3 void_mat_emission = void_emission_color * void_emission_energy;
	float void_mat_metallic = 0.0;
	float void_mat_roughness = 0.9; // High roughness for non-reflective, 'void' look

	// Blend between original and void material properties based on void_factor and void_strength
	ALBEDO = mix(base_albedo.rgb, void_mat_albedo.rgb, void_factor * void_strength);
	EMISSION = mix(base_emission, void_mat_emission, void_factor * void_strength);
	METALLIC = mix(metallic, void_mat_metallic, void_factor * void_strength);
	ROUGHNESS = mix(roughness, void_mat_roughness, void_factor * void_strength);
}