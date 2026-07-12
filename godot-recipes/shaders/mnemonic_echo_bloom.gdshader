shader_type canvas_item;

// Controls the overall intensity and animation progress of the bloom effect.
uniform float progress : hint_range(0.0, 1.0) = 0.0;
// Screen-space UV coordinates (0-1) of the memory shard's center.
uniform vec2 memory_pos_uv : hint_range(0.0, 1.0) = vec2(0.5, 0.5);
// Maximum radius of the effect from the memory shard's center.
uniform float max_radius : hint_range(0.0, 1.0) = 0.3;

// Intensity multiplier for the bloom color.
uniform float bloom_intensity : hint_range(0.0, 5.0) = 1.5;
// Saturation multiplier for affected areas.
uniform float saturation_amount : hint_range(1.0, 3.0) = 1.5;
// Contrast multiplier for affected areas.
uniform float contrast_amount : hint_range(1.0, 2.0) = 1.2;
// Strength of the screen-space distortion/ripple effect.
uniform float distortion_strength : hint_range(0.0, 0.05) = 0.01;
// Color of the bloom effect.
uniform vec4 bloom_color : source_color = vec4(1.0, 0.8, 0.5, 1.0);

void fragment() {
	// Calculate distance from the current pixel to the memory shard's center.
	float dist = distance(SCREEN_UV, memory_pos_uv);
	
	// Determine the weight of the effect for this pixel based on distance and max_radius.
	// smoothstep creates a smooth falloff from 0 to max_radius.
	float effect_weight = 1.0 - smoothstep(0.0, max_radius, dist);
	
	// Combine global progress with local effect weight.
	float current_intensity = effect_weight * progress;

	// If there's no intensity, just draw the screen texture normally.
	if (current_intensity <= 0.001) {
		COLOR = texture(SCREEN_TEXTURE, SCREEN_UV);
		return;
	}

	// Apply screen-space distortion based on intensity and direction from the center.
	vec2 offset_dir = normalize(SCREEN_UV - memory_pos_uv);
	vec2 distorted_uv = SCREEN_UV + (offset_dir * current_intensity * distortion_strength);
	
	// Sample the screen texture with the potentially distorted UV.
	vec4 base_color = texture(SCREEN_TEXTURE, distorted_uv);
	
	// Apply bloom effect.
	base_color.rgb += bloom_color.rgb * current_intensity * bloom_intensity;
	
	// Apply saturation.
	vec3 luma = vec3(0.299, 0.587, 0.114);
	vec3 gray = vec3(dot(base_color.rgb, luma));
	base_color.rgb = mix(gray, base_color.rgb, 1.0 + current_intensity * (saturation_amount - 1.0));
	
	// Apply contrast.
	base_color.rgb = mix(vec3(0.5), base_color.rgb, 1.0 + current_intensity * (contrast_amount - 1.0));
	
	COLOR = base_color;
}