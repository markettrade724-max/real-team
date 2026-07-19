shader_type canvas_item;

uniform float noise_intensity : hint_range(0.0, 1.0) = 0.0;
uniform float chromatic_aberration_strength : hint_range(0.0, 0.01) = 0.0;
uniform float desaturation_amount : hint_range(0.0, 1.0) = 0.0;
uniform float time : hint_range(0.0, 1000.0) = 0.0;

// A simple pseudo-random hash function for noise
float hash12(vec2 p) {
	vec3 p3  = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec4 color = texture(SCREEN_TEXTURE, uv);

	// Chromatic Aberration
	vec2 offset_r = vec2(chromatic_aberration_strength, 0.0);
	vec2 offset_g = vec2(0.0, 0.0);
	vec2 offset_b = vec2(-chromatic_aberration_strength, 0.0);

	vec4 col_r = texture(SCREEN_TEXTURE, uv + offset_r);
	vec4 col_g = texture(SCREEN_TEXTURE, uv + offset_g);
	vec4 col_b = texture(SCREEN_TEXTURE, uv + offset_b);

	color.r = col_r.r;
	color.g = col_g.g;
	color.b = col_b.b;

	// Desaturation
	float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	color.rgb = mix(color.rgb, vec3(luma), desaturation_amount);

	// Dynamic Noise/Static
	float noise = hash12(FRAGCOORD.xy / TEXTURE_PIXEL_SIZE + time * 10.0);
	color.rgb += (noise - 0.5) * noise_intensity * 2.0;

	COLOR = color;
}