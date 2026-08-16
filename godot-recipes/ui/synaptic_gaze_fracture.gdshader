shader_type canvas_item;

uniform sampler2D noise_texture : hint_default_white; // A noise texture for varied effects
uniform float identity_integrity = 1.0; // 0.0 (corrupted) to 1.0 (perfect)
uniform float tear_amount = 0.0;        // 0.0 (no tear) to 1.0 (full tear)
uniform float glitch_intensity = 0.0;   // 0.0 (no glitch) to 1.0 (strong glitch)
uniform float rip_effect = 0.0;         // 0.0 (inactive) to 1.0 (full rip)
uniform float suture_effect = 0.0;      // 0.0 (inactive) to 1.0 (full suture)
uniform float time_scale = 1.0;         // Controls speed of time-based effects for dynamic effects

void fragment() {
	vec2 base_uv = UV;
	vec2 distorted_uv = base_uv;
	vec4 color = texture(TEXTURE, base_uv);

	float current_time = TIME * time_scale;

	// --- Distortion based on identity_integrity and noise ---
	float distortion_factor = (1.0 - identity_integrity);
	if (distortion_factor > 0.001) {
		vec2 noise_sample = texture(noise_texture, base_uv * 2.0 + current_time * 0.1).rg;
		distorted_uv += (noise_sample - 0.5) * distortion_factor * 0.05;
	}

	// --- Glitch effect ---
	if (glitch_intensity > 0.001) {
		if (mod(current_time * 10.0, 1.0) < glitch_intensity * 0.2) {
			distorted_uv.x += sin(current_time * 100.0) * 0.005 * glitch_intensity;
			distorted_uv.y += cos(current_time * 120.0) * 0.005 * glitch_intensity;
		}
		vec4 r_channel = texture(TEXTURE, distorted_uv + vec2(0.003 * glitch_intensity, 0.0));
		vec4 g_channel = texture(TEXTURE, distorted_uv);
		vec4 b_channel = texture(TEXTURE, distorted_uv - vec2(0.003 * glitch_intensity, 0.0));
		color = vec4(r_channel.r, g_channel.g, b_channel.b, color.a);
	}

	// --- Apply final distortion to UV for the main texture sample ---
	color = texture(TEXTURE, distorted_uv);

	// --- Tearing effect ---
	if (tear_amount > 0.001) {
		float tear_noise = texture(noise_texture, base_uv * 5.0 - current_time * 0.2).r;
		if (tear_noise < tear_amount * 0.6) {
			color.a *= (tear_noise / (tear_amount * 0.6));
		}
		if (tear_noise < tear_amount * 0.3) {
			discard;
		}
	}

	// --- Rip effect (more aggressive tear/distortion, overrides others) ---
	if (rip_effect > 0.001) {
		float rip_noise = texture(noise_texture, base_uv * 8.0 + current_time * 0.5).r;
		if (rip_noise < rip_effect * 0.7) {
			discard;
		}
		float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		color.rgb = mix(color.rgb, vec3(gray), rip_effect * 0.8);
		color.rgb += sin(current_time * 50.0) * 0.1 * rip_effect;
		color.a = mix(color.a, 0.0, rip_effect * 0.5);
	}

	// --- Suture effect (stabilize/repair, counteracts negative effects) ---
	if (suture_effect > 0.001) {
		vec4 original_color = texture(TEXTURE, base_uv);
		color.rgb = mix(color.rgb, original_color.rgb, suture_effect * 0.5);
		color.a = mix(color.a, original_color.a, suture_effect * 0.5);
		color.rgb += suture_effect * 0.05;
	}

	COLOR = color;
}