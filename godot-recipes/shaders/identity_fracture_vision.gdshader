shader_type canvas_item;

render_mode screen_texture;

uniform float memory_integrity : hint_range(0.0, 1.0) = 1.0; // 1.0 = intact, 0.0 = fully lost
uniform float distortion_strength : hint_range(0.0, 0.1) = 0.03;
uniform float desaturation_factor : hint_range(0.0, 1.0) = 0.7;
uniform float color_bleed_factor : hint_range(0.0, 1.0) = 0.5;
uniform float noise_speed : hint_range(0.0, 5.0) = 1.5;
uniform float noise_scale : hint_range(0.0, 100.0) = 60.0;
uniform float specific_pattern_intensity : hint_range(0.0, 1.0) = 0.0; // For unique memory patterns

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

	float x0 = mix(bl, br, fp.x);
	float x1 = mix(tl, tr, fp.x);
	return mix(x0, x1, fp.y);
}

void fragment() {
	float effective_loss = 1.0 - memory_integrity; // 0.0 (intact) to 1.0 (fully lost)
	float current_time = TIME * noise_speed;

	// 1. UV Distortion (simulating perceptual drift)
	vec2 noise_uv_base = UV * noise_scale;
	vec2 noise_offset_a = vec2(noise(noise_uv_base + current_time), noise(noise_uv_base + current_time + 100.0));
	vec2 noise_offset_b = vec2(noise(noise_uv_base * 0.5 - current_time * 0.3), noise(noise_uv_base * 0.5 - current_time * 0.3 + 50.0));

	vec2 distortion_offset = (noise_offset_a - 0.5) * distortion_strength * effective_loss;
	distortion_offset += (noise_offset_b - 0.5) * distortion_strength * 0.5 * effective_loss;

	// Add specific memory pattern influence (e.g., a wave or ripple)
	distortion_offset.x += sin(UV.y * 30.0 + current_time * 3.0) * 0.005 * specific_pattern_intensity;
	distortion_offset.y += cos(UV.x * 25.0 + current_time * 2.5) * 0.005 * specific_pattern_intensity;

	vec2 distorted_uv = UV + distortion_offset;

	// 2. Sample SCREEN_TEXTURE
	vec4 final_color = texture(SCREEN_TEXTURE, distorted_uv);

	// 3. Color Desaturation
	float luma = dot(final_color.rgb, vec3(0.299, 0.587, 0.114));
	final_color.rgb = mix(final_color.rgb, vec3(luma), desaturation_factor * effective_loss);

	// 4. Color Bleed / Simplified Hue Shift
	float bleed_val = color_bleed_factor * effective_loss;
	final_color.rgb = mix(final_color.rgb, final_color.gbr, bleed_val); // Mix with shifted channels

	// 5. Subtle Temporal Artifacts / Ghosting
	// Sample slightly offset and blend with current color
	vec4 ghost_sample = texture(SCREEN_TEXTURE, UV + distortion_offset * 0.3);
	final_color.rgb = mix(final_color.rgb, ghost_sample.rgb, effective_loss * 0.2);

	// 6. Transient Overlay Patterns (using noise)
	float overlay_noise_val = noise(UV * noise_scale * 1.5 + current_time * 0.8);
	float overlay_intensity = effective_loss * 0.6; // Max 60% overlay when fully lost
	if (overlay_noise_val > 0.7) {
		final_color.rgb = mix(final_color.rgb, vec3(overlay_noise_val), overlay_intensity * (overlay_noise_val - 0.7) * 3.0);
	}

	COLOR = final_color;
}