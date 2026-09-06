shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_opaque, cull_back;

uniform sampler2D screen_texture : hint_screen_texture;
uniform sampler2D depth_texture : hint_depth_texture;
uniform sampler2D refraction_normal_map : hint_normal;
uniform float refraction_strength = 0.05;
uniform vec4 tint_color : source_color = vec4(1.0, 1.0, 1.0, 0.7);
uniform float depth_fade_start = 0.01;
uniform float depth_fade_end = 0.1;

void vertex() {
	// Standard vertex processing, passes vertex position to fragment shader
	POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
}

void fragment() {
	// Get screen-space UV for the current fragment
	vec2 screen_uv = SCREEN_UV;

	// Sample the unique normal map for this memory shard
	vec3 normal_sample = texture(refraction_normal_map, UV).rgb;

	// Calculate refraction offset based on normal map and strength
	// Normal map values (0-1) are converted to (-1 to 1) for direction
	vec2 offset = (normal_sample.xy * 2.0 - 1.0) * refraction_strength;

	// Apply offset to screen UV to get the refracted sampling point
	vec2 refracted_uv = screen_uv + offset;

	// Clamp refracted_uv to prevent sampling outside screen bounds, which can cause artifacts
	refracted_uv = clamp(refracted_uv, vec2(0.0), vec2(1.0));

	// Sample the screen texture at the refracted UV to get the distorted background color
	vec3 refracted_color = texture(screen_texture, refracted_uv).rgb;

	// Sample depth texture at current and refracted UVs to determine depth difference
	float current_depth_val = texture(depth_texture, screen_uv).r;
	float refracted_depth_val = texture(depth_texture, refracted_uv).r;

	// Calculate the absolute difference in depth. Small difference means shard is close to background.
	float depth_diff = abs(current_depth_val - refracted_depth_val);

	// Use smoothstep to create a smooth fade based on depth difference
	// Refraction is strongest when depth_diff is low (shard close to background)
	// Refraction fades out as depth_diff increases (shard far from background or very close)
	float fade_amount = smoothstep(depth_fade_start, depth_fade_end, depth_diff);

	// Mix the refracted color with the shard's base tint color
	// As refraction fades (fade_amount approaches 1), the shard becomes more opaque and tinted.
	ALBEDO = mix(refracted_color * tint_color.rgb, tint_color.rgb, fade_amount);

	// Adjust alpha based on the fade amount. Less refraction means more opaque shard.
	ALPHA = tint_color.a * (1.0 - fade_amount);
}