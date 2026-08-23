shader_type compute;

// Workgroup size: process 64 vertices per workgroup
group_size_x = 64;

// Input buffers for original mesh data
buffer readonly float[] vertices_in;
buffer readonly float[] normals_in;

// Output buffer for modified vertex positions
buffer writeonly float[] vertices_out;

// Uniforms for controlling the deformation
uniform float identity_integrity = 1.0; // 0.0 (lost) to 1.0 (full identity)
uniform float silence_proximity = 0.0;  // 0.0 (far) to 1.0 (very close to Silence entities)
uniform float time = 0.0;               // Global time for animation/noise evolution
uniform float dissolve_strength = 0.5;  // Maximum displacement for 'maw' effect
uniform float noise_scale = 0.1;        // Scale for per-vertex noise variation

// Basic hash-based pseudo-random noise function (for organic variation)
// For production, consider a more robust noise implementation (e.g., Simplex noise).
float hash(vec3 p) {
	p  = fract(p * 0.3183099 + p.yzx * 0.1333333);
	p *= p + 19.19;
	return fract((p.x + p.y) * p.z);
}

void main() {
	uint index = gl_GlobalInvocationID.x;
	uint vertex_float_idx = index * 3;

	// Ensure we don't access out of bounds
	if (vertex_float_idx + 2 >= vertices_in.length()) {
		return;
	}

	vec3 original_pos = vec3(
		vertices_in[vertex_float_idx],
		vertices_in[vertex_float_idx + 1],
		vertices_in[vertex_float_idx + 2]
	);

	vec3 original_normal = vec3(
		normals_in[vertex_float_idx],
		normals_in[vertex_float_idx + 1],
		normals_in[vertex_float_idx + 2]
	);

	// Calculate a base influence factor: higher when identity is low or silence is close
	// This factor drives the intensity of the deformation.
	float influence = (1.0 - identity_integrity) + silence_proximity;
	influence = clamp(influence, 0.0, 1.0); // Clamped between 0.0 (no effect) and 1.0 (max effect)

	// Add per-vertex noise for organic, non-uniform deformation
	float vertex_noise = hash(original_pos * noise_scale + time * 0.5);

	// Combine influence with noise to get the final deformation intensity for this vertex
	// The (0.5 + vertex_noise * 0.5) ensures noise scales from 0.5 to 1.0, preventing zero deformation.
	float final_deformation_intensity = influence * (0.5 + vertex_noise * 0.5);

	vec3 new_pos = original_pos;

	// 'Maw' effect: pull vertices downwards to simulate paths swallowing and abysses revealing.
	// The displacement direction is primarily downwards (negative Y-axis).
	vec3 pull_direction = vec3(0.0, -1.0, 0.0);

	float maw_displacement_amount = final_deformation_intensity * dissolve_strength;
	new_pos += pull_direction * maw_displacement_amount;

	// Write the new position to the output buffer
	vertices_out[vertex_float_idx] = new_pos.x;
	vertices_out[vertex_float_idx + 1] = new_pos.y;
	vertices_out[vertex_float_idx + 2] = new_pos.z;
}
