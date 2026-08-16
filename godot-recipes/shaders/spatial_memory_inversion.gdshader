shader_type spatial;
render_mode depth_draw_opaque, cull_back;

uniform vec3 inversion_origin = vec3(0.0, 0.0, 0.0);
uniform float inversion_radius = 5.0;
uniform float inversion_intensity = 0.0;
uniform float inversion_active = 0.0;

void vertex() {
	if (inversion_active > 0.5) {
		// Convert current vertex to world space
		vec3 world_vertex = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
		
		// Calculate vector from inversion origin to vertex
		vec3 diff = world_vertex - inversion_origin;
		float dist_sq = dot(diff, diff);

		// Apply inversion only if within radius and not at the exact origin (to prevent division by zero)
		if (dist_sq < inversion_radius * inversion_radius && dist_sq > 0.0001) {
			// Spherical inversion formula: P' = C + R^2 * (P - C) / |P - C|^2
			vec3 inverted_world_vertex = inversion_origin + (inversion_radius * inversion_radius) * diff / dist_sq;
			
			// Blend between original and inverted position based on intensity
			vec3 final_world_vertex = mix(world_vertex, inverted_world_vertex, inversion_intensity);
			
			// Convert the final world position back to local space for VERTEX
			VERTEX = (inverse(MODEL_MATRIX) * vec4(final_world_vertex, 1.0)).xyz;
		}
	}
}