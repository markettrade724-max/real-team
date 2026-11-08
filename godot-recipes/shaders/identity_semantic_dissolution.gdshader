shader_type canvas_item;
render_mode screen_texture_filter_linear;

uniform float memory_erosion_strength : hint_range(0.0, 1.0) = 0.5;
uniform float edge_threshold : hint_range(0.001, 0.1) = 0.01;
uniform float dissolution_spread : hint_range(0.0, 0.05) = 0.01;
uniform sampler2D noise_texture;
uniform float noise_scale : hint_range(0.1, 10.0) = 2.0;
uniform float time_speed : hint_range(0.0, 2.0) = 0.5;

void fragment() {
	vec2 screen_uv = SCREEN_UV;
	vec4 original_color = texture(SCREEN_TEXTURE, screen_uv);
	float original_depth = texture(DEPTH_TEXTURE, screen_uv).r;

	// Get pixel size for sampling offsets
	vec2 pixel_size = TEXTURE_PIXEL_SIZE;

	// Sample neighboring depths to detect edges
	float depth_left   = texture(DEPTH_TEXTURE, screen_uv + vec2(-pixel_size.x, 0.0)).r;
	float depth_right  = texture(DEPTH_TEXTURE, screen_uv + vec2( pixel_size.x, 0.0)).r;
	float depth_up     = texture(DEPTH_TEXTURE, screen_uv + vec2(0.0, -pixel_size.y)).r;
	float depth_down   = texture(DEPTH_TEXTURE, screen_uv + vec2(0.0,  pixel_size.y)).r;

	// Calculate depth differences
	float depth_diff_x = abs(depth_left - depth_right);
	float depth_diff_y = abs(depth_up - depth_down);

	// Combine differences to get overall edge intensity
	float edge_intensity = max(depth_diff_x, depth_diff_y);

	// Smoothly transition edge detection based on threshold
	float edge_factor = smoothstep(edge_threshold, edge_threshold * 2.0, edge_intensity);

	// Sample noise texture for chaotic patterns, animated over time
	vec2 noise_uv = screen_uv * noise_scale + TIME * time_speed;
	float noise_value = texture(noise_texture, noise_uv).r;

	// Calculate the total dissolution effect for the current pixel
	// This combines edge detection, noise, and the global erosion strength
	float dissolution_effect = edge_factor * noise_value * memory_erosion_strength;

	// Determine displacement direction based on noise (full circle)
	vec2 displacement_direction = vec2(cos(noise_value * 6.2831853), sin(noise_value * 6.2831853));

	// Calculate displaced UV coordinates
	vec2 displaced_uv = screen_uv + displacement_direction * dissolution_effect * dissolution_spread;

	// Sample the screen texture at the displaced UV
	vec4 final_color = texture(SCREEN_TEXTURE, displaced_uv);

	// Apply alpha fading: the more dissolved, the more transparent the pixel becomes
	final_color.a *= (1.0 - dissolution_effect);

	COLOR = final_color;
}
