extends Node

class_name CausalMemoryReforgeManager

# Emitted when an environment node is successfully reforged.
signal reforge_completed(reforged_node: Node3D)
# Emitted if a reforge attempt fails (e.g., no matching state).
signal reforge_failed(anchor_node: Node3D, shard_signature: String)

# Pre-defined reforged states. Key: "reforge_id", Value: Dictionary of "strength_level" -> PackedScene
# Example: {"crumbling_wall": {"weak": preload("res://reforged_states/wall_weak.tscn"), "strong": preload("res://reforged_states/wall_strong.tscn")}}
@export var reforged_states: Dictionary = {}
@export var reforge_shader: ShaderMaterial # Shader for visual transition

func _ready() -> void:
	if reforge_shader == null:
		push_warning("CausalMemoryReforgeManager: 'reforge_shader' is not assigned. Reforge will lack visual transition.")

# Initiates the reforge process for a given environment anchor.
# anchor_node: The Node3D in the environment to be reforged. It should have a 'reforge_id' metadata.
# shard_signature: A string identifying the type of memory shard used (can influence target state).
# strength: A float (0.0 to 1.0) indicating how strongly the memory is reforged.
func reforge_environment(anchor_node: Node3D, shard_signature: String, strength: float) -> void:
	if not anchor_node.has_meta("reforge_id"):
		push_warning("Anchor node '%s' does not have 'reforge_id' metadata. Cannot reforge." % anchor_node.name)
		reforge_failed.emit(anchor_node, shard_signature)
		return

	var reforge_id: String = anchor_node.get_meta("reforge_id")
	if not reforged_states.has(reforge_id):
		push_warning("No reforge states defined for ID '%s'." % reforge_id)
		reforge_failed.emit(anchor_node, shard_signature)
		return

	var target_state_key: String = _get_target_state_key(shard_signature, strength)
	if not reforged_states[reforge_id].has(target_state_key):
		push_warning("No target state '%s' found for reforge ID '%s'." % [target_state_key, reforge_id])
		reforge_failed.emit(anchor_node, shard_signature)
		return

	var new_scene_packed: PackedScene = reforged_states[reforge_id][target_state_key]
	if new_scene_packed == null:
		push_warning("PackedScene for '%s' is null." % target_state_key)
		reforge_failed.emit(anchor_node, shard_signature)
		return

	var new_instance: Node3D = new_scene_packed.instantiate()
	if new_instance == null:
		push_warning("Failed to instantiate new scene for '%s'." % target_state_key)
		reforge_failed.emit(anchor_node, shard_signature)
		return

	_apply_reforge_effect(anchor_node, new_instance)
	_swap_nodes(anchor_node, new_instance)
	reforge_completed.emit(new_instance)

# Determines the appropriate state key based on shard signature and strength.
func _get_target_state_key(shard_signature: String, strength: float) -> String:
	# Simple logic: "weak" for strength < 0.5, "strong" for strength >= 0.5
	# This can be expanded with more granular strength levels or specific shard_signature mappings.
	if strength < 0.5:
		return "weak"
	else:
		return "strong"

# Applies a visual transition effect using the assigned shader.
func _apply_reforge_effect(old_node: Node3D, new_node: Node3D) -> void:
	if reforge_shader == null:
		return

	var old_mesh: MeshInstance3D = _find_mesh_child(old_node)
	var new_mesh: MeshInstance3D = _find_mesh_child(new_node)

	if old_mesh:
		var temp_shader_old = reforge_shader.duplicate()
		temp_shader_old.set_shader_parameter("dissolve_factor", 1.0) # Start fully visible
		old_mesh.set_surface_override_material(0, temp_shader_old)
		var tween = create_tween()
		tween.tween_property(temp_shader_old, "shader_parameter/dissolve_factor", 0.0, 0.5)
		tween.tween_callback(Callable(old_mesh, "set_surface_override_material").bind(0, null))

	if new_mesh:
		var temp_shader_new = reforge_shader.duplicate()
		temp_shader_new.set_shader_parameter("dissolve_factor", 0.0) # Start fully dissolved
		new_mesh.set_surface_override_material(0, temp_shader_new)
		var tween = create_tween()
		tween.tween_property(temp_shader_new, "shader_parameter/dissolve_factor", 1.0, 0.5)
		tween.tween_callback(Callable(new_mesh, "set_surface_override_material").bind(0, null))

# Helper to find the first MeshInstance3D child recursively.
func _find_mesh_child(node: Node) -> MeshInstance3D:
	if node is MeshInstance3D:
		return node
	for child in node.get_children():
		var mesh_child = _find_mesh_child(child)
		if mesh_child:
			return mesh_child
	return null

# Swaps the old node with the new instance in the scene tree.
func _swap_nodes(old_node: Node3D, new_node: Node3D) -> void:
	var parent = old_node.get_parent()
	if parent == null:
		push_warning("Old node '%s' has no parent. Cannot swap." % old_node.name)
		return

	new_node.global_transform = old_node.global_transform
	parent.add_child(new_node)
	new_node.owner = old_node.owner # Maintain scene ownership for saving/instancing
	old_node.queue_free() # Remove the old node
