shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform vec3 abyss_center_world_pos = vec3(0.0);
uniform float identity_integrity = 1.0; // 0.0 (fully eroded) to 1.0 (no erosion)
uniform float base_safe_radius = 20.0; // Max safe radius when integrity is 1.0
uniform float abyss_falloff = 5.0; // Width of the transition zone
uniform vec4 abyss_color : source_color = vec4(0.0, 0.0, 0.1, 1.0); // Deep blue/black void color
uniform sampler2D noise_texture;
uniform float noise_scale = 0.1;
uniform float noise_intensity = 0.5; // How much noise distorts the edge

void fragment() {
	// Calculate the current safe radius based on identity integrity
	float current_safe_radius = base_safe_radius * identity_integrity;

	// Calculate world-space distance from the current fragment to the abyss center (Lyra's position)
	float dist_to_center = distance(WORLD_POSITION.xyz, abyss_center_world_pos);

	// Sample noise texture for organic erosion shape
	vec2 noise_uv = WORLD_POSITION.xz * noise_scale;
	float noise_val = texture(noise_texture, noise_uv).r; // Use red channel for simplicity

	// Adjust the distance by noise to create an uneven, organic edge
	float noisy_dist = dist_to_center - (noise_val - 0.5) * noise_intensity * abyss_falloff;

	// Calculate the erosion factor using smoothstep for a smooth transition
	// The erosion starts when noisy_dist exceeds current_safe_radius
	// and fully erodes after current_safe_radius + abyss_falloff
	float erosion_factor = smoothstep(current_safe_radius, current_safe_radius + abyss_falloff, noisy_dist);

	// Blend ALBEDO towards abyss_color and ALPHA towards 0.0 based on erosion_factor
	ALBEDO = mix(ALBEDO, abyss_color.rgb, erosion_factor);
	ALPHA = 1.0 - erosion_factor;

	// If fully eroded, discard the fragment to prevent rendering
	if (ALPHA < 0.01) { // Small threshold to avoid floating point issues
		discard;
	}
}