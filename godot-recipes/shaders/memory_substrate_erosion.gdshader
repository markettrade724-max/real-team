shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, refraction_enabled;

// Original Material Properties
uniform sampler2D albedo_texture : hint_albedo;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D normal_texture : hint_normal;
uniform float normal_scale : hint_range(0.0, 1.0) = 1.0;
uniform sampler2D roughness_texture : hint_roughness_r;
uniform float roughness_value : hint_range(0.0, 1.0) = 0.5;

// Silence Substrate Properties
uniform vec4 silence_albedo_color : source_color = vec4(0.1, 0.0, 0.2, 1.0);
uniform sampler2D silence_normal_texture : hint_normal;
uniform float silence_normal_scale : hint_range(0.0, 1.0) = 1.0;
uniform sampler2D silence_roughness_texture : hint_roughness_r;
uniform float silence_roughness_value : hint_range(0.0, 1.0) = 0.2;
uniform vec4 silence_emissive_color : source_color = vec4(0.5, 0.0, 1.0, 1.0);
uniform float silence_refraction_strength : hint_range(0.0, 1.0) = 0.1;

// Erosion Control
uniform float erosion_threshold : hint_range(0.0, 1.0) = 0.5; // Base erosion level
uniform float erosion_speed : hint_range(0.0, 10.0) = 1.0;    // Speed of noise animation
uniform vec3 erosion_seed = vec3(0.0, 0.0, 0.0);             // Offset for noise
uniform float noise_scale = 1.0;                             // Scale of the noise pattern and triplanar UVs

// Global Game State (updated by GDScript)
uniform float memory_integrity : hint_range(0.0, 1.0) = 1.0; // 1.0 = full memory, 0.0 = no memory
uniform float silence_proximity_intensity : hint_range(0.0, 1.0) = 0.0; // 0.0 = far, 1.0 = very close/intense

// --- Noise Function (Compact Value Noise) ---
float rand(vec3 co){
	return fract(sin(dot(co.xyz ,vec3(12.9898,78.233,45.164))) * 43758.5453);
}

float noise3D(vec3 p) {
	vec3 ip = floor(p);
	vec3 fp = fract(p);
	fp = fp * fp * (3.0 - 2.0 * fp); // Smoothstep interpolation

	float n000 = rand(ip);
	float n100 = rand(ip + vec3(1,0,0));
	float n010 = rand(ip + vec3(0,1,0));
	float n001 = rand(ip + vec3(0,0,1));
	float n110 = rand(ip + vec3(1,1,0));
	float n101 = rand(ip + vec3(1,0,1));
	float n011 = rand(ip + vec3(0,1,1));
	float n111 = rand(ip + vec3(1,1,1));

	float x0 = mix(n000, n100, fp.x);
	float x1 = mix(n010, n110, fp.x);
	float x2 = mix(n001, n101, fp.x);
	float x3 = mix(n011, n111, fp.x);

	float y0 = mix(x0, x1, fp.y);
	float y1 = mix(x2, x3, fp.y);

	return mix(y0, y1, fp.z);
}

void fragment() {
	vec3 world_pos = (WORLD_MATRIX * vec4(VERTEX, 1.0)).xyz; // World-space position

	// --- Triplanar Mapping ---
	vec3 blend_weights = abs(NORMAL);
	blend_weights = normalize(max(vec3(0.00001), blend_weights)); // Avoid division by zero
	blend_weights /= (blend_weights.x + blend_weights.y + blend_weights.z); // Ensure sum is 1

	// UVs for each projection (scaled by noise_scale for texture tiling)
	vec2 uv_x = world_pos.yz * noise_scale;
	vec2 uv_y = world_pos.xz * noise_scale;
	vec2 uv_z = world_pos.xy * noise_scale;

	// Sample original textures
	vec4 albedo_x = texture(albedo_texture, uv_x);
	vec4 albedo_y = texture(albedo_texture, uv_y);
	vec4 albedo_z = texture(albedo_texture, uv_z);
	vec3 normal_x = decode_normal(texture(normal_texture, uv_x).rgb);
	vec3 normal_y = decode_normal(texture(normal_texture, uv_y).rgb);
	vec3 normal_z = decode_normal(texture(normal_texture, uv_z).rgb);
	float roughness_x = texture(roughness_texture, uv_x).r;
	float roughness_y = texture(roughness_texture, uv_y).r;
	float roughness_z = texture(roughness_texture, uv_z).r;

	// Sample silence textures
	vec3 silence_normal_x = decode_normal(texture(silence_normal_texture, uv_x).rgb);
	vec3 silence_normal_y = decode_normal(texture(silence_normal_texture, uv_y).rgb);
	vec3 silence_normal_z = decode_normal(texture(silence_normal_texture, uv_z).rgb);
	float silence_roughness_x = texture(silence_roughness_texture, uv_x).r;
	float silence_roughness_y = texture(silence_roughness_texture, uv_y).r;
	float silence_roughness_z = texture(silence_roughness_texture, uv_z).r;

	// Blend original textures
	vec4 base_albedo = albedo_x * blend_weights.x + albedo_y * blend_weights.y + albedo_z * blend_weights.z;
	vec3 base_normal = normal_x * blend_weights.x + normal_y * blend_weights.y + normal_z * blend_weights.z;
	float base_roughness = roughness_x * blend_weights.x + roughness_y * blend_weights.y + roughness_z * blend_weights.z;

	// Blend silence textures
	vec3 silence_blended_normal = silence_normal_x * blend_weights.x + silence_normal_y * blend_weights.y + silence_normal_z * blend_weights.z;
	float silence_blended_roughness = silence_roughness_x * blend_weights.x + silence_roughness_y * blend_weights.y + silence_roughness_z * blend_weights.z;

	// --- Erosion Logic ---
	vec3 noise_coord = (world_pos * noise_scale) + erosion_seed + (TIME * erosion_speed);
	float noise_val = noise3D(noise_coord); // Noise is 0-1

	// Adjust threshold based on game state
	// Lower memory_integrity and higher silence_proximity_intensity increase erosion
	float dynamic_threshold = erosion_threshold - (1.0 - memory_integrity) * 0.5 - (silence_proximity_intensity * 0.5);
	dynamic_threshold = clamp(dynamic_threshold, 0.0, 1.0); // Ensure threshold stays valid

	// Smooth transition between materials
	float mix_factor = smoothstep(dynamic_threshold - 0.1, dynamic_threshold + 0.1, noise_val);

	// --- Apply Blending ---
	ALBEDO = mix(base_albedo.rgb * albedo_color.rgb, silence_albedo_color.rgb, mix_factor);
	NORMAL = mix(base_normal * normal_scale, silence_blended_normal * silence_normal_scale, mix_factor);
	ROUGHNESS = mix(base_roughness * roughness_value, silence_blended_roughness * silence_roughness_value, mix_factor);
	EMISSION = mix(vec3(0.0), silence_emissive_color.rgb, mix_factor);
	REFRACTION = mix(0.0, silence_refraction_strength, mix_factor);
}