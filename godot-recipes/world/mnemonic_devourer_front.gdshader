shader_type compute;

layout(local_size_x = 8, local_size_y = 8, local_size_z = 8) in;

// Output: 3D texture representing the erosion field (R channel stores erosion intensity)
uniform writeonly image3D erosion_field;

// Inputs from GDScript
uniform vec3 player_pos;
uniform float identity_integrity; // 0.0 (fully eroded) to 1.0 (no erosion)
uniform float global_erosion_progress; // 0.0 (start) to 1.0 (full world eroded)
uniform int num_silence_entities;
const int MAX_SILENCE_ENTITIES = 8; // Max entities for array size
uniform vec3 silence_entity_positions[MAX_SILENCE_ENTITIES];
uniform float erosion_radius_player;
uniform float erosion_radius_silence;
uniform vec3 world_bounds_min;
uniform vec3 world_bounds_max;
uniform vec3 field_resolution; // Resolution of the erosion_field texture (e.g., vec3(64.0, 64.0, 64.0))

void main() {
	ivec3 id = ivec3(gl_GlobalInvocationID.xyz);
	
	// Ensure ID is within texture bounds
	if (id.x >= int(field_resolution.x) || id.y >= int(field_resolution.y) || id.z >= int(field_resolution.z)) {
		return;
	}

	vec3 field_size = world_bounds_max - world_bounds_min;
	vec3 normalized_id = vec3(id) / (field_resolution - 1.0); // Normalize to [0, 1]
	vec3 world_pos = world_bounds_min + normalized_id * field_size;

	float erosion_value = 0.0;

	// Global erosion front (advancing along Z-axis)
	float z_progress_norm = (world_pos.z - world_bounds_min.z) / field_size.z;
	erosion_value = max(erosion_value, smoothstep(global_erosion_progress - 0.1, global_erosion_progress + 0.1, z_progress_norm));

	// Player proximity erosion (more erosion if identity_integrity is low)
	float player_erosion_factor = 1.0 - identity_integrity; // 0 (no erosion) to 1 (full erosion)
	float dist_to_player = distance(world_pos, player_pos);
	erosion_value = max(erosion_value, player_erosion_factor * (1.0 - smoothstep(0.0, erosion_radius_player, dist_to_player)));

	// Silence entity proximity erosion
	for (int i = 0; i < num_silence_entities; ++i) {
		if (i >= MAX_SILENCE_ENTITIES) break; // Safety check
		float dist_to_silence = distance(world_pos, silence_entity_positions[i]);
		erosion_value = max(erosion_value, 1.0 - smoothstep(0.0, erosion_radius_silence, dist_to_silence));
	}

	erosion_value = clamp(erosion_value, 0.0, 1.0);

	imageStore(erosion_field, id, vec4(erosion_value, 0.0, 0.0, 1.0));
}