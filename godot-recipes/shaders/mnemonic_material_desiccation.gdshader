shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform sampler2D albedo_texture : source_color;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform float roughness : hint_range(0.0, 1.0) = 0.5;

uniform sampler2D noise_texture;
uniform float memory_integrity : hint_range(0.0, 1.0) = 1.0; // 1.0 = fully solid, 0.0 = fully dissolved
uniform vec4 dissolve_color : source_color = vec4(0.8, 0.9, 1.0, 1.0); // Color of the shimmering energy
uniform float dissolve_edge_width : hint_range(0.001, 0.2) = 0.05; // Width of the transition edge
uniform float noise_scale = 1.0; // Scale of the noise texture for variation

void fragment() {
	vec4 base_color = texture(albedo_texture, UV) * albedo_color;
	ALBEDO = base_color.rgb;
	ROUGHNESS = roughness;

	float noise_val = texture(noise_texture, UV * noise_scale).r;
	float threshold = 1.0 - memory_integrity;

	// Calculate alpha based on noise and memory integrity
	float alpha_cutoff = smoothstep(threshold - dissolve_edge_width, threshold, noise_val);
	ALPHA = alpha_cutoff;

	// Apply shimmering dissolve color at the edge
	if (alpha_cutoff < 1.0) {
		// Mix original albedo with dissolve_color, more dissolve_color as it gets closer to threshold
		ALBEDO = mix(dissolve_color.rgb, ALBEDO, alpha_cutoff);
	}
}