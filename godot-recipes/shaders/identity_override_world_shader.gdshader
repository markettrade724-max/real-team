shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

// Base memory world texture
uniform sampler2D base_texture : hint_albedo;

// Silence override texture (e.g., noise, static, glitch pattern)
uniform sampler2D silence_texture : hint_normal;

// Identity Integrity (0.0 = lost, 1.0 = full)
uniform float identity_integrity : hint_range(0.0, 1.0, 0.01) = 1.0;
uniform vec4 identity_tint_color : source_color = vec4(0.0, 0.5, 1.0, 0.1); // Tint applied when identity is low

// Silence Override parameters
uniform float silence_intensity : hint_range(0.0, 1.0, 0.01) = 0.0; // Overall strength of the silence effect
uniform float silence_spread : hint_range(0.0, 1.0, 0.01) = 0.0; // How much of the surface is covered by silence
uniform float silence_glitch_speed = 1.0; // Speed of silence texture animation
uniform float silence_glitch_scale = 1.0; // Scale of silence texture UVs

// Global time for animation (updated by script)
uniform float time_elapsed;

void fragment() {
	// 1. Get base color from the memory world texture
	vec4 base_color = texture(base_texture, UV);

	// 2. Apply identity tint based on integrity
	// As identity_integrity goes from 1.0 to 0.0, (1.0 - identity_integrity) goes from 0.0 to 1.0
	// The tint becomes more prominent as identity is lost.
	base_color.rgb = mix(base_color.rgb, identity_tint_color.rgb, (1.0 - identity_integrity) * identity_tint_color.a);

	// 3. Calculate silence override effect
	// Animate UVs for the silence texture to create a dynamic glitch effect
	vec2 glitch_uv = UV * silence_glitch_scale + vec2(time_elapsed * silence_glitch_speed, time_elapsed * silence_glitch_speed * 0.5);
	vec4 silence_sample = texture(silence_texture, glitch_uv);

	// Create a mask for the silence spread.
	// Using the red channel of the silence_texture itself for a more organic, noisy spread.
	// smoothstep creates a smooth transition for the mask.
	float silence_mask_value = silence_sample.r; // Use one channel of the noise for the mask
	float silence_mask = smoothstep(0.5 - silence_spread * 0.5, 0.5 + silence_spread * 0.5, silence_mask_value);

	// Combine mask with overall intensity
	silence_mask *= silence_intensity;

	// 4. Blend silence texture over base color
	// The ALBEDO is a mix between the base (tinted) color and the silence texture,
	// controlled by the calculated silence_mask.
	ALBEDO = mix(base_color.rgb, silence_sample.rgb, silence_mask);
}
