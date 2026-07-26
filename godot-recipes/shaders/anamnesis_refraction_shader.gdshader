shader_type spatial;

render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx, screen_space_refraction_enabled;

uniform float refraction_strength : hint_range(0.0, 0.5, 0.001) = 0.05; // How strong the refraction is
uniform float noise_scale : hint_range(1.0, 50.0, 0.1) = 10.0; // Scale of the noise pattern
uniform float time_speed : hint_range(0.1, 5.0, 0.01) = 1.0; // Speed of the time-based distortion
uniform int distortion_layers : hint_range(1, 8, 1) = 3; // Number of blended distortion layers

// Simple 2D pseudo-random hash function
vec2 hash22(vec2 p) {
	p = fract(p * vec2(5.3983, 5.4427));
	p += dot(p.yx, p.xy + vec2(21.5351, 14.3137));
	return fract(vec2(p.x * p.y, p.x + p.y));
}

// Generates a noise value based on UV and time
vec2 get_noise_offset(vec2 uv, float time_val) {
	vec2 p = uv * noise_scale;
	vec2 n = hash22(p + time_val * time_speed);
	return (n - 0.5) * 2.0; // Map to [-1, 1] range
}

void fragment() {
	vec2 base_screen_uv = SCREEN_UV;
	vec4 final_refracted_color = vec4(0.0);
	float total_weight = 0.0;

	for (int i = 0; i < distortion_layers; i++) {
		float angle = float(i) * (2.0 * PI / float(distortion_layers));
		vec2 offset_direction = vec2(cos(angle), sin(angle));

		// Vary the time slightly for each layer to make them distinct
		float current_time_val = TIME + float(i) * 0.1;

		// Get noise offset based on screen UV and varied time
		vec2 noise_offset = get_noise_offset(base_screen_uv, current_time_val);

		// Apply refraction strength and direction
		vec2 distorted_uv = base_screen_uv + noise_offset * refraction_strength * offset_direction;

		// Clamp UVs to screen bounds to prevent artifacts
		distorted_uv = clamp(distorted_uv, vec2(0.0), vec2(1.0));

		// Sample the screen texture with the distorted UV
		vec4 sample_color = texture(SCREEN_TEXTURE, distorted_uv);

		// Simple additive blending
		final_refracted_color += sample_color;
		total_weight += 1.0;
	}

	// Average the sampled colors
	if (total_weight > 0.0) {
		final_refracted_color /= total_weight;
	}

	ALBEDO = final_refracted_color.rgb;
	ALPHA = 1.0; // Full opacity for the refraction effect
}