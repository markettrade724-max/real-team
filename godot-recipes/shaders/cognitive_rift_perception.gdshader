shader_type spatial;
render_mode unshaded;
render_mode blend_mix;

uniform float memory_erosion_factor : hint_range(0.0, 1.0) = 0.0;
uniform float distortion_scale : hint_range(0.0, 0.1) = 0.05;
uniform float noise_speed : hint_range(0.0, 2.0) = 0.5;
uniform float depth_influence : hint_range(0.0, 2.0) = 1.0;

float hash(vec2 p) {
	p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
	return -1.0 + 2.0 * fract(sin(p.x * p.y) * 43758.5453123);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);

	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));

	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float total = 0.0;
	float amplitude = 0.5;
	float frequency = 2.0;
	for (int i = 0; i < 4; ++i) {
		total += noise(p * frequency) * amplitude;
		frequency *= 2.0;
		amplitude *= 0.5;
	}
	return total;
}

void fragment() {
	float depth = texture(DEPTH_TEXTURE, SCREEN_UV).r;

	vec2 noise_uv = SCREEN_UV * 10.0 + TIME * noise_speed;
	float distortion_noise = fbm(noise_uv);

	float final_depth_multiplier = mix(1.0, depth, depth_influence);
	float final_distortion_amount = distortion_scale * memory_erosion_factor * final_depth_multiplier;

	vec2 distorted_uv = SCREEN_UV + distortion_noise * final_distortion_amount;

	ALBEDO = texture(SCREEN_TEXTURE, distorted_uv).rgb;
}