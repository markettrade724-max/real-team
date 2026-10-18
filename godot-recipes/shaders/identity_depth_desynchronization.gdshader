shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float identity_coherence : hint_range(0.0, 1.0, 0.01) = 1.0;
uniform float distortion_strength : hint_range(0.0, 0.5, 0.001) = 0.05;
uniform float distortion_frequency : hint_range(0.1, 20.0, 0.1) = 5.0;
uniform float distortion_speed : hint_range(0.0, 5.0, 0.1) = 1.0;
uniform float distance_fade_start : hint_range(0.0, 100.0, 1.0) = 10.0;
uniform float distance_fade_end : hint_range(0.0, 200.0, 1.0) = 50.0;

// Hash function for pseudo-random numbers
vec3 hash33(vec3 p) {
	p = fract(p * vec3(443.897, 441.423, 437.195));
	p += dot(p, p.yxz + 19.23);
	return fract((p.xxy + p.yzz) * p.zyx);
}

// Simple 3D value noise function (returns value between -1 and 1)
float snoise(vec3 p) {
	vec3 ip = floor(p);
	vec3 fp = fract(p);
	fp = fp * fp * (3.0 - 2.0 * fp); // Smoothstep interpolation

	vec3 h0 = hash33(ip);
	vec3 h1 = hash33(ip + vec3(1.0, 0.0, 0.0));
	vec3 h2 = hash33(ip + vec3(0.0, 1.0, 0.0));
	vec3 h3 = hash33(ip + vec3(0.0, 0.0, 1.0));
	vec3 h4 = hash33(ip + vec3(1.0, 1.0, 0.0));
	vec3 h5 = hash33(ip + vec3(1.0, 0.0, 1.0));
	vec3 h6 = hash33(ip + vec3(0.0, 1.0, 1.0));
	vec3 h7 = hash33(ip + vec3(1.0, 1.0, 1.0));

	float n000 = dot(h0, fp);
	float n100 = dot(h1, fp - vec3(1.0, 0.0, 0.0));
	float n010 = dot(h2, fp - vec3(0.0, 1.0, 0.0));
	float n001 = dot(h3, fp - vec3(0.0, 0.0, 1.0));
	float n110 = dot(h4, fp - vec3(1.0, 1.0, 0.0));
	float n101 = dot(h5, fp - vec3(1.0, 0.0, 1.0));
	float n011 = dot(h6, fp - vec3(0.0, 1.0, 1.0));
	float n111 = dot(h7, fp - vec3(1.0, 1.0, 1.0));

	float x0 = mix(n000, n100, fp.x);
	float x1 = mix(n010, n110, fp.x);
	float x2 = mix(n001, n101, fp.x);
	float x3 = mix(n011, n111, fp.x);

	float y0 = mix(x0, x1, fp.y);
	float y1 = mix(x2, x3, fp.y);

	return mix(y0, y1, fp.z) * 2.0 - 1.0;
}

void vertex() {
	// Calculate world position of the vertex
	vec3 world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;

	// Calculate distance from the camera to the world position
	float dist = length(CAMERA_POSITION_WORLD - world_pos);

	// Determine the base distortion strength based on identity coherence.
	// Lower coherence (closer to 0.0) means higher distortion.
	float coherence_effect = 1.0 - identity_coherence;

	// Apply distance-based amplification to make distant objects distort more.
	// Uses smoothstep to create a gradual fade-in of the distance effect.
	float dist_effect = smoothstep(distance_fade_start, distance_fade_end, dist);
	
	// Combine all factors to get the final magnitude for vertex displacement
	float final_distortion_magnitude = coherence_effect * distortion_strength * dist_effect;

	// Generate 3D noise for dynamic, organic displacement
	vec3 noise_coord = world_pos * distortion_frequency + TIME * distortion_speed;
	float displacement_noise = snoise(noise_coord);

	// Displace the vertex along its normal, scaled by the noise and final magnitude.
	// This creates a 'breathing' or 'shimmering' effect that alters perceived shape and depth,
	// making distances unreliable and spatial reasoning challenging.
	VERTEX += NORMAL * displacement_noise * final_distortion_magnitude;
}

void fragment() {
	// The core visual effect is handled in the vertex shader by manipulating geometry.
	// The fragment shader simply passes through the base material's albedo color.
	ALBEDO = texture(ALBEDO_TEXTURE, UV).rgb;
}