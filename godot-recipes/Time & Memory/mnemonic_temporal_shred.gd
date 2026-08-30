extends CharacterBody3D

# Shader code for temporal decay. Save this as 'temporal_decay_shader.gdshader' in your project.
const TEMPORAL_DECAY_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D albedo_texture : source_color;
uniform sampler2D normal_texture : hint_normal;
uniform sampler2D ruin_normal_texture : hint_normal;
uniform sampler2D displacement_texture : hint_black; // Use a black texture if no displacement
uniform float time_decay_factor : hint_range(0.0, 1.0) = 0.0;
uniform float displacement_strength : hint_range(0.0, 1.0) = 0.1;
uniform float alpha_erosion_threshold : hint_range(0.0, 1.0) = 0.5;

void vertex() {
	// Vertex displacement based on decay factor
	vec3 displacement = texture(displacement_texture, UV).rgb * 2.0 - 1.0; // Map to -1 to 1 range
	VERTEX.xyz += NORMAL * displacement.r * displacement_strength * time_decay_factor;
}

void fragment() {
	vec4 albedo_tex = texture(albedo_texture, UV);
	ALBEDO = albedo_tex.rgb;

	// Alpha erosion
	float alpha_cutoff = mix(1.0, alpha_erosion_threshold, time_decay_factor);
	ALPHA = step(alpha_cutoff, albedo_tex.a); // Discard pixels below cutoff
	ALPHA_SCISSOR_THRESHOLD = 0.5; // Enable alpha scissor for hard cutoffs

	// Normal map morphing
	vec3 normal_orig = texture(normal_texture, UV).rgb;
	vec3 normal_ruin = texture(ruin_normal_texture, UV).rgb;
	NORMAL_MAP = mix(normal_orig, normal_ruin, time_decay_factor);
	NORMAL_MAP_ENABLED = true;

	// Optional: Add some color tinting or emission for visual feedback of decay
	EMISSION = ALBEDO * time_decay_factor * 0.1; // Slight glow as it decays
}
"""

@export_group("Chronal Shred Settings")
@export var shred_duration: float = 3.0
@export var shred_speed_multiplier: float = 2.0
@export var memory_loss_rate: float = 10.0 # Memories per second during shred
@export var decay_radius: float = 10.0
@export var decay_force_multiplier: float = 50.0

var shred_active: bool = false
var current_shred_time: float = 0.0
var current_memory_fragments: int = 100 # Example: Lyra's total memories

signal memory_lost(amount: int)
signal chronal_shred_activated
signal chronal_shred_deactivated

func _ready() -> void:
	# Ensure "activate_shred" action is defined in Project Settings -> Input Map
	if not InputMap.has_action("activate_shred"):
		print("Warning: 'activate_shred' action not found in Input Map. Please add it.")

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("activate_shred") and not shred_active:
		activate_chronal_shred()

func _physics_process(delta: float) -> void:
	if shred_active:
		current_shred_time += delta
		if current_shred_time >= shred_duration:
			deactivate_chronal_shred()
			return

		_process_memory_loss(delta)
		_update_nearby_memory_fragments(current_shred_time / shred_duration)

func activate_chronal_shred() -> void:
	shred_active = true
	current_shred_time = 0.0
	# Placeholder for Lyra's speed boost. Integrate with your player movement script.
	# Example: get_parent().get_node("PlayerMovement").speed *= shred_speed_multiplier
	chronal_shred_activated.emit()
	print("Chronal Shred Activated! Memories are fading...")

func deactivate_chronal_shred() -> void:
	shred_active = false
	# Placeholder for resetting Lyra's speed. Integrate with your player movement script.
	# Example: get_parent().get_node("PlayerMovement").speed /= shred_speed_multiplier
	# Memory fragments maintain their decayed state or self-destruct based on their own logic.
	chronal_shred_deactivated.emit()
	print("Chronal Shred Deactivated.")

func _process_memory_loss(delta: float) -> void:
	var loss_amount = int(memory_loss_rate * delta)
	if loss_amount > 0:
		current_memory_fragments = max(0, current_memory_fragments - loss_amount)
		memory_lost.emit(loss_amount)

func _update_nearby_memory_fragments(decay_factor: float) -> void:
	var space_rid = get_world_3d().get_space()
	var query_params = PhysicsShapeQueryParameters3D.new()
	query_params.shape = SphereShape3D.new()
	query_params.shape.radius = decay_radius
	query_params.transform.origin = global_transform.origin
	query_params.collision_mask = 1 # Assuming memory fragments are on physics layer 1

	var results = PhysicsServer3D.space_cast_shape(space_rid, query_params, 10) # Max 10 results

	for result in results:
		var body_rid = result.rid
		var body_node = PhysicsServer3D.body_get_owner(body_rid)
		# Check if the node is a MemoryFragment and apply decay
		if body_node and body_node.has_method("apply_decay"):
			body_node.apply_decay(decay_factor, decay_force_multiplier)

# --- REQUIRED HELPER SCRIPT: memory_fragment.gd ---
# Create a new script named 'memory_fragment.gd' and attach it to your RigidBody3D memory fragment nodes.
#
# # memory_fragment.gd
# extends RigidBody3D
#
# @export var crumble_threshold: float = 0.8 # Decay factor at which it crumbles
# @export var crumble_impulse_strength: float = 10.0
# @export var crumble_angular_impulse_strength: float = 5.0
# @export var decayed_mesh_resource: Mesh # Optional: a pre-decayed mesh to swap to
#
# var current_decay_factor: float = 0.0
# var crumbled: bool = false
#
# func _ready() -> void:
# 	# Ensure the MeshInstance3D child has a ShaderMaterial with 'temporal_decay_shader.gdshader'
# 	var mesh_instance = $MeshInstance3D # Assuming a child MeshInstance3D
# 	if mesh_instance and mesh_instance.mesh:
# 		var material = mesh_instance.get_active_material(0)
# 		if material is ShaderMaterial:
# 			material.set_shader_parameter("time_decay_factor", 0.0)
# 	set_collision_layer_value(1, true) # Set to physics layer 1 for Lyra's query
# 	set_collision_mask_value(1, true) # Also collide with layer 1 if needed
#
# func apply_decay(factor: float, force_multiplier: float) -> void:
# 	current_decay_factor = factor
# 	var mesh_instance = $MeshInstance3D
# 	if mesh_instance and mesh_instance.mesh:
# 		var material = mesh_instance.get_active_material(0)
# 		if material is ShaderMaterial:
# 			material.set_shader_parameter("time_decay_factor", current_decay_factor)
#
# 	if current_decay_factor >= crumble_threshold and not crumbled:
# 		_crumble(force_multiplier)
# 		crumbled = true
#
# func _crumble(force_multiplier: float) -> void:
# 	# Apply an impulse to simulate crumbling
# 	var random_direction = Vector3(randf_range(-1.0, 1.0), randf_range(0.5, 1.0), randf_range(-1.0, 1.0)).normalized()
# 	apply_central_impulse(random_direction * crumble_impulse_strength * force_multiplier)
# 	apply_torque_impulse(Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).normalized() * crumble_angular_impulse_strength)
#
# 	# Optionally, swap mesh to a pre-fractured one or hide/queue_free
# 	if decayed_mesh_resource:
# 		$MeshInstance3D.mesh = decayed_mesh_resource
# 	# Or, if it's meant to disappear after crumbling:
# 	# await get_tree().create_timer(2.0).timeout
# 	# queue_free()
