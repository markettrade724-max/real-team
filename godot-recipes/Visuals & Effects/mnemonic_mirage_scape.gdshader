shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform vec3 lost_memory_center = vec3(0.0, 0.0, 0.0);
uniform float lost_memory_radius = 10.0;
uniform float distortion_strength = 0.1;
uniform float stabilization_factor : hint_range(0.0, 1.0) = 0.0; // 0.0 = full distortion, 1.0 = stable
uniform float noise_scale = 0.5;
uniform sampler2D base_albedo_texture : source_color;

// Simple 3D Value Noise
float rand3d(vec3 n) {
	return fract(sin(dot(n, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
}

float interpolate(float a, float b, float x) {
	float f = x * x * (3.0 - 2.0 * x); // Smoothstep interpolation
	return a * (1.0 - f) + b * f;
}

float value_noise_3d(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);

	// Get 8 corners of the cube
	float v000 = rand3d(i);
	float v100 = rand3d(i + vec3(1.0, 0.0, 0.0));
	float v010 = rand3d(i + vec3(0.0, 1.0, 0.0));
	float v110 = rand3d(i + vec3(1.0, 1.0, 0.0));
	float v001 = rand3d(i + vec3(0.0, 0.0, 1.0));
	float v101 = rand3d(i + vec3(1.0, 0.0, 1.0));
	float v011 = rand3d(i + vec3(0.0, 1.0, 1.0));
	float v111 = rand3d(i + vec3(1.0, 1.0, 1.0));

	// Interpolate along X axis
	float ix0 = interpolate(v000, v100, f.x);
	float ix1 = interpolate(v010, v110, f.x);
	float ix2 = interpolate(v001, v101, f.x);
	float ix3 = interpolate(v011, v111, f.x);

	// Interpolate along Y axis
	float iy0 = interpolate(ix0, ix1, f.y);
	float iy1 = interpolate(ix2, ix3, f.y);

	// Interpolate along Z axis
	return interpolate(iy0, iy1, f.z);
}

void vertex() {
	float dist = distance(WORLD_POSITION.xyz, lost_memory_center);
	float effect_factor = 1.0 - smoothstep(lost_memory_radius * 0.8, lost_memory_radius, dist);
	effect_factor *= (1.0 - stabilization_factor); // Apply stabilization

	if (effect_factor > 0.0) {
		vec3 noise_pos = WORLD_POSITION.xyz * noise_scale + vec3(TIME * 0.5);
		vec3 displacement = vec3(
			value_noise_3d(noise_pos + vec3(100.0)),
			value_noise_3d(noise_pos + vec3(200.0)),
			value_noise_3d(noise_pos + vec3(300.0))
		) * 2.0 - 1.0; // Map 0-1 to -1-1

		VERTEX += displacement * distortion_strength * effect_factor;
	}
}

void fragment() {
	float dist = distance(WORLD_POSITION.xyz, lost_memory_center);
	float effect_factor = 1.0 - smoothstep(lost_memory_radius * 0.8, lost_memory_radius, dist);
	effect_factor *= (1.0 - stabilization_factor); // Apply stabilization

	vec2 distorted_uv = UV;
	float alpha_mod = 1.0;

	if (effect_factor > 0.0) {
		vec3 noise_pos = WORLD_POSITION.xyz * noise_scale + vec3(TIME * 0.5);
		vec2 uv_offset = vec2(
			value_noise_3d(noise_pos + vec3(400.0)),
			value_noise_3d(noise_pos + vec3(500.0))
		) * 2.0 - 1.0; // Map 0-1 to -1-1

		distorted_uv += uv_offset * distortion_strength * 0.5 * effect_factor;

		// Opacity variation
		float opacity_noise = value_noise_3d(noise_pos + vec3(600.0, TIME * 0.2, 700.0));
		// Mix between full opacity and a lower, noisy opacity
		alpha_mod = mix(1.0, 0.5 + opacity_noise * 0.5, effect_factor);
	}

	vec4 albedo_color = texture(base_albedo_texture, distorted_uv);
	ALBEDO = albedo_color.rgb;
	ALPHA = albedo_color.a * alpha_mod;
}