shader_type canvas_item;

uniform sampler2D silence_void_texture;
uniform float memory_integrity : hint_range(0.0, 1.0, 0.01) = 1.0;
uniform float silence_proximity : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform float sunder_threshold : hint_range(0.0, 1.0, 0.01) = 0.5;
uniform float sunder_intensity : hint_range(0.0, 1.0, 0.01) = 0.8;
uniform float sunder_distortion_strength : hint_range(0.0, 0.1, 0.001) = 0.02;
uniform float sunder_speed : hint_range(0.0, 5.0, 0.1) = 1.0;

float hash21(vec2 p) {
	p = fract(p * vec2(234.56, 789.01));
	p += dot(p, p.yx + 19.19);
	return fract(p.x * p.y);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec4 scene_color = texture(SCREEN_TEXTURE, uv);

	float effect_strength = (1.0 - memory_integrity) + silence_proximity;
	effect_strength = clamp(effect_strength, 0.0, 1.0);

	if (effect_strength <= 0.001) {
		COLOR = scene_color;
		return;
	}

	vec2 noise_uv = uv * 5.0 + TIME * sunder_speed;
	float noise_val = hash21(noise_uv);

	float sunder_mask = step(sunder_threshold * (1.0 - effect_strength), noise_val);

	if (sunder_mask > 0.5) {
		vec2 distorted_uv = uv + (noise_val - 0.5) * sunder_distortion_strength * effect_strength;
		scene_color = texture(SCREEN_TEXTURE, distorted_uv);

		vec4 void_color = texture(silence_void_texture, uv * 2.0 + TIME * 0.5);

		COLOR = mix(scene_color, void_color, sunder_intensity * effect_strength);
	} else {
		COLOR = scene_color;
	}
}