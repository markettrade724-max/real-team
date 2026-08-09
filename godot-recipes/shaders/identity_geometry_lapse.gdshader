shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D noise_texture : hint_default_black; // A NoiseTexture resource for displacement patterns
uniform float time : hint_range(0.0, 1000.0) = 0.0;
uniform float memory_integrity : hint_range(0.0, 1.0) = 1.0; // 1.0 = full memory, 0.0 = no memory
uniform float proximity_to_silence : hint_range(0.0, 1.0) = 0.0; // 0.0 = far, 1.0 = close
uniform float distortion_strength : hint_range(0.0, 1.0) = 0.1; // Overall strength of geometric distortion
uniform float distortion_frequency : hint_range(0.1, 10.0) = 1.0; // Scale of the noise pattern
uniform vec4 void_color : source_color = vec4(0.1, 0.1, 0.1, 1.0); // Color of the void revealed by distortion
uniform float void_blend_threshold : hint_range(0.0, 1.0) = 0.05; // Displacement magnitude to start revealing the void

varying float v_displacement_magnitude;

void vertex() {
	vec3 world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Combine world position (XZ plane for ground-like effect), frequency, and time for noise sampling
	vec2 noise_uv = world_pos.xz * distortion_frequency + time * 0.1;

	// Sample noise texture and remap from [0,1] to [-1,1]
	float noise_val = texture(noise_texture, noise_uv).r;
	noise_val = noise_val * 2.0 - 1.0;

	// Calculate active distortion factor: more distortion when memory is low OR silence is close
	float active_distortion_factor = max(1.0 - memory_integrity, proximity_to_silence);
	active_distortion_factor = clamp(active_distortion_factor, 0.0, 1.0);

	// Displace vertex along its normal based on noise, strength, and active distortion
	vec3 displacement_direction = NORMAL;
	vec3 displacement = displacement_direction * noise_val * distortion_strength * active_distortion_factor;

	VERTEX += displacement;

	// Pass the magnitude of displacement to the fragment shader for void blending
	v_displacement_magnitude = length(displacement);
}

void fragment() {
	// Get the base color from albedo texture or uniform
	vec4 base_color = ALBEDO_TEXTURE == null ? vec4(ALBEDO, 1.0) : texture(ALBEDO_TEXTURE, UV);

	// Calculate blend factor for the void color based on displacement magnitude
	// The void starts blending at 'void_blend_threshold' and is fully blended at 'void_blend_threshold + 0.05'
	float void_blend_factor = smoothstep(void_blend_threshold, void_blend_threshold + 0.05, v_displacement_magnitude);

	// Blend between the base color and the void color
	ALBEDO = mix(base_color.rgb, void_color.rgb, void_blend_factor);
	ALPHA = base_color.a; // Maintain original alpha
}