shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D albedo_texture : source_color;
uniform float memory_erosion_factor : hint_range(0.0, 1.0) = 0.0;
uniform vec4 void_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform vec4 erosion_tint_color : source_color = vec4(0.5, 0.0, 0.5, 1.0); // Purple tint
uniform float displacement_strength : hint_range(0.0, 1.0) = 0.1;
uniform float flicker_speed : hint_range(0.0, 10.0) = 5.0;
uniform float flicker_density : hint_range(0.0, 10.0) = 2.0;

// Simple hash function for pseudo-random noise (2D input)
float hash21(vec2 p) {
	p = fract(p * vec2(123.45, 678.90));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

// Simple hash function for pseudo-random noise (3D input)
float hash31(vec3 p) {
	p = fract(p * vec3(123.45, 678.90, 345.67));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y * p.z);
}

void vertex() {
	// Apply vertex displacement for jagged, crumbling geometry
	if (memory_erosion_factor > 0.0) {
		float displacement_noise = hash31(VERTEX.xyz * flicker_density + TIME * flicker_speed);
		// Displace along normal, scaled by noise and erosion factor
		VERTEX += NORMAL * (displacement_noise - 0.5) * displacement_strength * memory_erosion_factor;
	}
}

void fragment() {
	vec4 base_color = texture(albedo_texture, UV);

	// Desaturate and tint textures
	float desaturation_factor = memory_erosion_factor;
	float luma = dot(base_color.rgb, vec3(0.299, 0.587, 0.114));
	vec3 desaturated_color = mix(base_color.rgb, vec3(luma), desaturation_factor);
	vec3 processed_color_rgb = mix(desaturated_color, erosion_tint_color.rgb, desaturation_factor);

	// Noise-based threshold mask for transparency and void reveal
	float noise_val = hash21(UV * flicker_density + TIME * flicker_speed);
	float dissolve_threshold = 1.0 - memory_erosion_factor; // 1.0 = no erosion, 0.0 = full erosion

	if (noise_val < dissolve_threshold) {
		// Solid part of the material
		ALBEDO = processed_color_rgb;
		ALPHA = base_color.a;
	} else {
		// Dissolving part, blending towards void_color and transparency
		float dissolve_progress = smoothstep(dissolve_threshold, dissolve_threshold + 0.1, noise_val);
		ALBEDO = mix(processed_color_rgb, void_color.rgb, dissolve_progress);
		ALPHA = mix(base_color.a, 0.0, dissolve_progress);
	}
}