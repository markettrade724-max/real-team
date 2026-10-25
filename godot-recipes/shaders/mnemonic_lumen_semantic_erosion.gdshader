shader_type spatial;
render_mode unshaded;

uniform float memory_integrity = 1.0; // 0.0 (corrupted) to 1.0 (intact)
uniform sampler2D albedo_texture : source_color;
uniform sampler2D normal_texture : hint_normal;
uniform sampler2D memory_noise_texture; // Perlin noise or similar for distortion
uniform vec4 memory_bleed_color : source_color;
uniform float bleed_intensity = 0.5;
uniform float normal_distortion_strength = 0.1;
uniform float shadow_corruption_threshold = 0.1; // Below this light ratio, shadows are corrupted
uniform float shadow_corruption_intensity = 0.5;

void fragment() {
	vec2 base_uv = UV;
	float distortion_factor = 1.0 - memory_integrity; // 0.0 (intact) to 1.0 (corrupted)

	// --- UV Distortion for 'memory noise' --- 
	// Distorts UVs for albedo and normal textures, creating a 'shimmering' or 'unstable' look.
	vec2 noise_uv_scroll = base_uv * 0.5 + TIME * 0.05;
	vec3 noise_sample = texture(memory_noise_texture, noise_uv_scroll).rgb;
	vec2 distorted_uv = base_uv + (noise_sample.rg - 0.5) * distortion_factor * 0.1;

	// --- Base Albedo and Normal --- 
	vec3 albedo_base = texture(albedo_texture, distorted_uv).rgb;
	vec3 normal_map = texture(normal_texture, distorted_uv).rgb;
	vec3 normal_tangent = normal_map * 2.0 - 1.0;
	vec3 normal_world = normalize(TANGENT * normal_tangent.x + BITANGENT * normal_tangent.y + NORMAL * normal_tangent.z);

	// --- Normal Distortion based on memory_integrity --- 
	// Makes surfaces appear to warp or shift, affecting how light reflects.
	vec3 normal_noise_sample = (texture(memory_noise_texture, base_uv * 0.2 + TIME * 0.1).rgb - 0.5) * 2.0;
	normal_world = normalize(mix(normal_world, normal_world + normal_noise_sample * normal_distortion_strength, distortion_factor));

	vec3 total_light_contribution = vec3(0.0);

	// --- Custom Lighting Loop --- 
	// Iterates through all active lights to calculate their contribution.
	for (int i = 0; i < LIGHT_COUNT; i++) {
		vec3 light_dir = LIGHT_DIRECTION[i];
		vec3 light_color = LIGHT_COLOR[i].rgb;
		float light_attenuation = LIGHT_ATTENUATION[i];

		float NdotL = max(0.0, dot(normal_world, light_dir));
		vec3 diffuse_light = albedo_base * NdotL * light_color * light_attenuation;

		// --- Temporal Light Bleeding --- 
		// Blends a 'memory bleed color' into the light, making light appear to carry echoes of past states.
		float bleed_mix_factor = distortion_factor * bleed_intensity * NdotL;
		diffuse_light = mix(diffuse_light, memory_bleed_color.rgb * light_color * light_attenuation, bleed_mix_factor);

		total_light_contribution += diffuse_light;
	}

	// --- Shadow Semantic Corruption --- 
	// Areas receiving less direct light (simulated shadows) are further corrupted with noise/color shifts.
	float max_possible_light = float(LIGHT_COUNT) * 1.0; // Assumes max light intensity of 1.0 per light
	float light_ratio = length(total_light_contribution) / max_possible_light;

	if (light_ratio < shadow_corruption_threshold) {
		float corruption_amount = (shadow_corruption_threshold - light_ratio) / shadow_corruption_threshold;
		corruption_amount *= distortion_factor * shadow_corruption_intensity;

		vec3 shadow_noise_sample = (texture(memory_noise_texture, base_uv * 0.1 + TIME * 0.5).rgb - 0.5) * 2.0;
		total_light_contribution += shadow_noise_sample * corruption_amount * 0.2; // Add some noise color
		total_light_contribution = mix(total_light_contribution, total_light_contribution * 0.5 + memory_bleed_color.rgb * 0.2, corruption_amount);
	}

	ALBEDO = total_light_contribution;
}