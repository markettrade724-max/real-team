shader_type spatial;
render_mode blend_mix, depth_draw_alpha_prepass, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D texture_albedo : source_color;
uniform vec4 albedo : source_color = vec4(1.0);

uniform float instability_strength : hint_range(0.0, 1.0) = 0.5;
uniform float noise_scale : hint_range(0.1, 10.0) = 2.0;
uniform float dissolve_threshold : hint_range(0.0, 1.0) = 0.0;
uniform float dissolve_edge_width : hint_range(0.0, 0.1) = 0.02;
uniform vec4 dissolve_edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float time_speed : hint_range(0.0, 5.0) = 0.5;

// Simplex Noise (from https://gist.github.com/patriciogonzalezvivo/670c241675c24d65966e)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
	const vec2 C = vec2(1.0/6.0, 1.0/3.0);
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

	vec3 i  = floor(v + dot(v, C.yyy) );
	vec3 x0 = v -   i + dot(i, C.xxx) ;

	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min( g.xyz, l.zxy );
	vec3 i2 = max( g.xyz, l.zxy );

	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + C.yyy;
	vec3 x3 = x0 - D.yyy;

	i = mod289(i);
	vec4 p = permute( permute( permute(
	         i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
	       + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
	       + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

	vec4 n_ = taylorInvSqrt(vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)));
	vec4 n = n_ * p;

	vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
	m = m * m;
	return 105.0 * dot(m*m, n);
}

void vertex() {
	// Vertex displacement based on noise
	float noise_val_vertex = snoise(VERTEX * noise_scale + TIME * time_speed);
	// Remap noise from [-1, 1] to [0, 1] for displacement magnitude
	noise_val_vertex = (noise_val_vertex + 1.0) * 0.5;
	VERTEX += NORMAL * noise_val_vertex * instability_strength;
}

void fragment() {
	vec4 base_color = texture(texture_albedo, UV) * albedo;

	// Fragment dissolve based on noise
	float noise_val_fragment = snoise(WORLD_POSITION * noise_scale + TIME * time_speed);
	// Remap noise from [-1, 1] to [0, 1]
	noise_val_fragment = (noise_val_fragment + 1.0) * 0.5;

	// Apply dissolve effect
	float alpha_clip = noise_val_fragment - dissolve_threshold;
	if (alpha_clip < 0.0) {
		discard;
	}

	// Apply dissolve edge glow
	float edge_factor = smoothstep(0.0, dissolve_edge_width, alpha_clip);
	ALBEDO = mix(dissolve_edge_color.rgb, base_color.rgb, edge_factor);
	ALPHA = mix(dissolve_edge_color.a, base_color.a, edge_factor);
}