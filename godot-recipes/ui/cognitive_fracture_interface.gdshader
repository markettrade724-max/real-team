shader_type canvas_item;

uniform float fracture_intensity : hint_range(0.0, 1.0) = 0.0; // Master control
uniform float desaturation_amount : hint_range(0.0, 1.0) = 0.0;
uniform float distortion_amount : hint_range(0.0, 0.1) = 0.0;
uniform float glitch_amount : hint_range(0.0, 1.0) = 0.0; // Pixelation/color shift
uniform float void_mask_strength : hint_range(0.0, 1.0) = 0.0;
uniform float suture_strength : hint_range(0.0, 1.0) = 0.0; // Visibility of scars
uniform vec2 suture_direction = vec2(1.0, 0.0); // Direction of the main scar line
uniform float suture_offset = 0.0; // Position of the main scar line

// Simple random function for void mask and glitch noise
float rand(vec2 co) {
	return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 base_uv = UV;
	vec4 final_color = texture(TEXTURE, base_uv);

	// Apply distortion based on fracture_intensity and distortion_amount
	vec2 distorted_uv = base_uv;
	distorted_uv.x += sin(base_uv.y * 20.0 + TIME * 5.0) * distortion_amount * fracture_intensity;
	distorted_uv.y += cos(base_uv.x * 15.0 + TIME * 4.0) * distortion_amount * fracture_intensity;
	final_color = texture(TEXTURE, distorted_uv);

	// Apply desaturation
	float lum = dot(final_color.rgb, vec3(0.299, 0.587, 0.114));
	final_color.rgb = mix(final_color.rgb, vec3(lum), desaturation_amount * fracture_intensity);

	// Apply glitch (pixelation and color shift)
	if (glitch_amount * fracture_intensity > 0.0) {
		vec2 pixel_uv = floor(distorted_uv * (1.0 - glitch_amount * fracture_intensity) * 100.0) / ((1.0 - glitch_amount * fracture_intensity) * 100.0);
		vec4 glitch_color = texture(TEXTURE, pixel_uv);

		// Simple color channel shift
		vec2 shift_r = vec2(sin(TIME * 15.0) * glitch_amount * fracture_intensity * 0.005, 0.0);
		vec2 shift_g = vec2(cos(TIME * 12.0) * glitch_amount * fracture_intensity * 0.005, 0.0);
		vec2 shift_b = vec2(sin(TIME * 18.0) * glitch_amount * fracture_intensity * 0.005, 0.0);

		glitch_color.r = texture(TEXTURE, distorted_uv + shift_r).r;
		glitch_color.g = texture(TEXTURE, distorted_uv + shift_g).g;
		glitch_color.b = texture(TEXTURE, distorted_uv + shift_b).b;

		final_color = mix(final_color, glitch_color, glitch_amount * fracture_intensity);
	}

	// Apply void mask
	float current_void_mask_strength = void_mask_strength * fracture_intensity;
	if (current_void_mask_strength > 0.0) {
		float void_noise = rand(base_uv * 10.0 + TIME * 0.5);
		if (void_noise < current_void_mask_strength) {
			final_color.a = 0.0; // Make it transparent
		}
	}

	// Apply suture scars
	if (suture_strength > 0.0) {
		float dist_to_suture = abs(dot(base_uv - vec2(0.5), suture_direction) - suture_offset);
		float scar_effect = smoothstep(0.0, 0.01 + suture_strength * 0.02, dist_to_suture); // Wider scar with more strength
		vec3 scar_color = vec3(0.1, 0.0, 0.0); // Dark red scar
		final_color.rgb = mix(final_color.rgb, scar_color, (1.0 - scar_effect) * suture_strength);
	}

	COLOR = final_color;
}