shader_type canvas_item;

uniform sampler2D SCREEN_TEXTURE : hint_screen_texture;
uniform sampler2D history_frame_0; // Most recent past frame
uniform sampler2D history_frame_1; // Older past frame
uniform sampler2D history_frame_2; // Oldest past frame

uniform float memory_cohesion = 1.0; // 0.0 (low cohesion, high effect) to 1.0 (high cohesion, low effect)
uniform float silence_proximity = 0.0; // 0.0 (far) to 1.0 (close, high effect)
uniform float blend_strength_base = 0.1; // Base opacity for historical frames
uniform float offset_intensity = 0.01; // Max UV offset for historical frames
uniform float distortion_intensity = 0.005; // Max distortion strength
uniform float color_shift_intensity = 0.05; // Max color shift strength
uniform float time_elapsed = 0.0; // Time for subtle animation

void fragment() {
	vec4 current_color = texture(SCREEN_TEXTURE, UV);
	vec4 final_color = current_color;

	// Calculate overall effect intensity based on game state
	float effect_intensity = (1.0 - memory_cohesion) + silence_proximity;
	effect_intensity = clamp(effect_intensity, 0.0, 1.0);

	// Blend historical frames
	// Frame 0 (most recent past)
	if (textureSize(history_frame_0, 0).x > 1) {
		float frame_age_factor = 0.2; // Younger frames have more impact
		float current_frame_effect = effect_intensity * (1.0 - frame_age_factor);

		vec2 offset_uv = UV;
		offset_uv += vec2(sin(time_elapsed * 5.0 + UV.x * 10.0) * offset_intensity * current_frame_effect,
		                  cos(time_elapsed * 7.0 + UV.y * 12.0) * offset_intensity * current_frame_effect);
		// Add distortion based on screen texture noise
		offset_uv += vec2(texture(SCREEN_TEXTURE, UV * 0.5 + vec2(time_elapsed * 0.1, 0.0)).r - 0.5,
		                  texture(SCREEN_TEXTURE, UV * 0.5 + vec2(0.0, time_elapsed * 0.1)).g - 0.5) * distortion_intensity * current_frame_effect;

		vec4 history_color = texture(history_frame_0, offset_uv);
		// Apply color shift
		history_color.rgb += vec3(sin(time_elapsed * 3.0) * color_shift_intensity * current_frame_effect,
		                          cos(time_elapsed * 4.0) * color_shift_intensity * current_frame_effect,
		                          sin(time_elapsed * 5.0) * color_shift_intensity * current_frame_effect);

		final_color = mix(final_color, history_color, blend_strength_base * current_frame_effect);
	}

	// Frame 1 (older past frame)
	if (textureSize(history_frame_1, 0).x > 1) {
		float frame_age_factor = 0.5; // Older frames have less impact
		float current_frame_effect = effect_intensity * (1.0 - frame_age_factor);

		vec2 offset_uv = UV;
		offset_uv += vec2(sin(time_elapsed * 4.0 + UV.y * 11.0) * offset_intensity * current_frame_effect,
		                  cos(time_elapsed * 6.0 + UV.x * 13.0) * offset_intensity * current_frame_effect);
		offset_uv += vec2(texture(SCREEN_TEXTURE, UV * 0.6 + vec2(time_elapsed * 0.15, 0.0)).g - 0.5,
		                  texture(SCREEN_TEXTURE, UV * 0.6 + vec2(0.0, time_elapsed * 0.15)).b - 0.5) * distortion_intensity * current_frame_effect;

		vec4 history_color = texture(history_frame_1, offset_uv);
		history_color.rgb += vec3(cos(time_elapsed * 2.5) * color_shift_intensity * current_frame_effect,
		                          sin(time_elapsed * 3.5) * color_shift_intensity * current_frame_effect,
		                          cos(time_elapsed * 4.5) * color_shift_intensity * current_frame_effect);

		final_color = mix(final_color, history_color, blend_strength_base * current_frame_effect);
	}

	// Frame 2 (oldest past frame)
	if (textureSize(history_frame_2, 0).x > 1) {
		float frame_age_factor = 0.8; // Even older frames have minimal impact
		float current_frame_effect = effect_intensity * (1.0 - frame_age_factor);

		vec2 offset_uv = UV;
		offset_uv += vec2(sin(time_elapsed * 3.0 + UV.x * 9.0) * offset_intensity * current_frame_effect,
		                  cos(time_elapsed * 5.0 + UV.y * 10.0) * offset_intensity * current_frame_effect);
		offset_uv += vec2(texture(SCREEN_TEXTURE, UV * 0.7 + vec2(time_elapsed * 0.2, 0.0)).b - 0.5,
		                  texture(SCREEN_TEXTURE, UV * 0.7 + vec2(0.0, time_elapsed * 0.2)).r - 0.5) * distortion_intensity * current_frame_effect;

		vec4 history_color = texture(history_frame_2, offset_uv);
		history_color.rgb += vec3(sin(time_elapsed * 2.0) * color_shift_intensity * current_frame_effect,
		                          cos(time_elapsed * 3.0) * color_shift_intensity * current_frame_effect,
		                          sin(time_elapsed * 4.0) * color_shift_intensity * current_frame_effect);

		final_color = mix(final_color, history_color, blend_strength_base * current_frame_effect);
	}

	COLOR = final_color;
}