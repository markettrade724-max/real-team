shader_type canvas_item;

uniform sampler2D texture_albedo : hint_albedo;
uniform sampler2D texture_void : hint_black; // ViewportTexture for the void
uniform sampler2D texture_erosion_noise : hint_white; // Noise texture for erosion pattern

uniform float erosion_amount : hint_range(0.0, 1.0) = 0.0; // 0.0 = no erosion, 1.0 = full erosion
uniform float erosion_softness : hint_range(0.0, 0.5) = 0.1; // Width of the transition edge
uniform float distortion_strength : hint_range(0.0, 0.1) = 0.0; // Strength of UV distortion
uniform float distortion_speed : hint_range(0.0, 5.0) = 1.0; // Speed of distortion animation

void fragment() {
	// Sample noise for erosion pattern, animate its UV for dynamic effect
	vec2 noise_uv_offset = vec2(TIME * distortion_speed * 0.1, TIME * distortion_speed * 0.1);
	float noise_val = texture(texture_erosion_noise, UV * 2.0 + noise_uv_offset).r;

	// Calculate erosion factor using smoothstep for a soft transition
	float erosion_factor = smoothstep(erosion_amount - erosion_softness, erosion_amount + erosion_softness, noise_val);

	// Calculate distorted UV for the original texture
	vec2 distorted_uv = UV;
	if (distortion_strength > 0.0) {
		// Use another noise sample for distortion, animate it differently
		vec2 distortion_noise_offset = (texture(texture_erosion_noise, UV * 3.0 + TIME * distortion_speed * 0.7).rg - 0.5) * 2.0;
		// Apply distortion, reducing its effect as the area becomes more eroded
		distorted_uv = UV + distortion_noise_offset * distortion_strength * (1.0 - erosion_factor);
	}

	// Sample original and void textures
	vec4 original_color = texture(texture_albedo, distorted_uv);
	vec4 void_color = texture(texture_void, UV);

	// Mix between void and original based on erosion factor
	COLOR = mix(void_color, original_color, erosion_factor);
}