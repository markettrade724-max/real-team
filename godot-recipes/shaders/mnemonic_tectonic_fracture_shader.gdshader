shader_type spatial;
render_mode depth_draw_opaque, cull_back;

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D texture_albedo : source_color;

uniform float identity_cohesion : hint_range(0.0, 1.0, 0.01) = 1.0; // 1.0 = no fracture, 0.0 = max fracture
uniform float hunter_proximity_factor : hint_range(0.0, 1.0, 0.01) = 0.0; // 0.0 = no hunter, 1.0 = max hunter influence
uniform float fracture_intensity : hint_range(0.0, 5.0, 0.01) = 0.5; // Overall scale of displacement
uniform float noise_scale : hint_range(0.1, 50.0, 0.1) = 10.0; // Frequency of noise
uniform float time_speed : hint_range(0.0, 2.0, 0.01) = 0.5; // Speed of animation
uniform vec4 void_color : source_color = vec4(0.0, 0.0, 0.0, 1.0); // Color for the 'void' effect

varying float v_total_fracture;

// Simplex Noise (from https://github.com/ashima/webgl-noise/blob/master/src/noise3D.glsl)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float snoise(vec3 v) {
	const vec2 C = vec2(1.0/6.0, 1.0/3.0) ;
	const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

	vec3 i  = floor(v + dot(v, C.yyy) );
	vec3 x0 = v -   i + dot(i, C.xxx) ;

	vec3 g = step(x0.yzx, x0.xyz);
	vec3 l = 1.0 - g;
	vec3 i1 = min( g.xyz, l.zxy );
	vec3 i2 = max( g.xyz, l.zxy );

	vec3 x1 = x0 - i1 + C.xxx;
	vec3 x2 = x0 - i2 + C.yyy;
	vec3 x3 = x0 - D.yyy + C.zzz;

	i = mod289(i);
	vec4 p = permute( permute( permute(
		i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
		+ i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
		+ i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

	vec4 j4 = 4.0 * sin(p) + 1.0;
	vec4 N = permute( permute(p) + j4 );

	vec4 w0 = vec4(x0.x, x1.x, x2.x, x3.x);
	vec4 w1 = vec4(x0.y, x1.y, x2.y, x3.y);
	vec4 w2 = vec4(x0.z, x1.z, x2.z, x3.z);

	vec4 h = N - floor(N / 7.0) * 7.0;
	vec4 s = sign(h - 3.5);
	vec4 a = abs(h - 3.5);
	vec4 m = step(a, vec4(2.5));

	vec4 b0 = vec4(s.x, s.y, s.z, s.w);
	vec4 b1 = vec4(s.y, s.z, s.w, s.x);
	vec4 b2 = vec4(s.z, s.w, s.x, s.y);

	vec4 c0 = vec4(m.x, m.y, m.z, m.w);
	vec4 c1 = vec4(m.y, m.z, m.w, m.x);
	vec4 c2 = vec4(m.z, m.w, m.x, m.y);

	vec4 p0 = b0 * c0 + b1 * c1 + b2 * c2;
	vec4 p1 = b1 * c0 + b2 * c1 + b0 * c2;
	vec4 p2 = b2 * c0 + b0 * c1 + b1 * c2;

	vec4 p3 = vec4(1.0) - p0 - p1 - p2;

	vec4 g0 = vec4(p0.x, p1.x, p2.x, p3.x);
	vec4 g1 = vec4(p0.y, p1.y, p2.y, p3.y);
	vec4 g2 = vec4(p0.z, p1.z, p2.z, p3.z);

	vec4 N_grad = taylorInvSqrt(vec4(dot(g0, g0), dot(g1, g1), dot(g2, g2), dot(p3, p3)));
	g0 *= N_grad.x;
	g1 *= N_grad.y;
	g2 *= N_grad.z;
	p3 *= N_grad.w;

	vec4 grad_x = vec4(g0.x, g1.x, g2.x, p3.x);
	vec4 grad_y = vec4(g0.y, g1.y, g2.y, p3.y);
	vec4 grad_z = vec4(g0.z, g1.z, g2.z, p3.z);

	vec4 m_x = vec4(x0.x, x1.x, x2.x, x3.x);
	vec4 m_y = vec4(x0.y, x1.y, x2.y, x3.y);
	vec4 m_z = vec4(x0.z, x1.z, x2.z, x3.z);

	vec4 n = m_x * grad_x + m_y * grad_y + m_z * grad_z;

	vec4 t = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
	vec4 d = t * t * t * t;

	return dot(d, n) * 2.0;
}

void vertex() {
	float total_fracture_factor = (1.0 - identity_cohesion) + hunter_proximity_factor;
	total_fracture_factor = clamp(total_fracture_factor, 0.0, 1.0);

	v_total_fracture = total_fracture_factor;

	if (total_fracture_factor > 0.001) {
		vec3 noise_pos = (WORLD_MATRIX * vec4(VERTEX, 1.0)).xyz * noise_scale;
		vec3 noise_offset = vec3(
			snoise(noise_pos + vec3(TIME * time_speed, 0.0, 0.0)),
			snoise(noise_pos + vec3(0.0, TIME * time_speed, 0.0)),
			snoise(noise_pos + vec3(0.0, 0.0, TIME * time_speed))
		);

		VERTEX += normalize(noise_offset) * fracture_intensity * total_fracture_factor;
	}
}

void fragment() {
	vec4 base_color = albedo;
	if (texture_albedo != null) {
		base_color *= texture(texture_albedo, UV);
	}

	ALBEDO = mix(base_color.rgb, void_color.rgb, v_total_fracture);
	ALPHA = base_color.a;
}
