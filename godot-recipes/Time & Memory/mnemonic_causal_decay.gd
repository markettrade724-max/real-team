@tool
extends MeshInstance3D

@export_group("Decay Settings")
@export var decay_intensity: float = 0.1: # How much vertices displace per ripple
	set(value):
		decay_intensity = max(0.0, value)
@export var decay_radius: float = 5.0: # Radius of effect for each ripple
	set(value):
		decay_radius = max(0.1, value)
@export var memory_fragments: Array[String] = ["Childhood Home", "First Friend", "Lost Locket"] # Fragments to lose

var _collision_shape: CollisionShape3D
var _mesh_data_tool: MeshDataTool

func _ready():
	if Engine.is_editor_hint():
		return

	if not mesh:
		printerr("MnemonicCausalDecay: MeshInstance3D has no mesh assigned.")
		set_process(false)
		return

	_collision_shape = find_child("CollisionShape3D")
	if not _collision_shape:
		printerr("MnemonicCausalDecay: No CollisionShape3D child found. Please add one.")
		set_process(false)
		return

	if not mesh is ArrayMesh:
		printerr("MnemonicCausalDecay: Mesh is not an ArrayMesh. Cannot modify procedurally.")
		set_process(false)
		return

	_mesh_data_tool = MeshDataTool.new()

func apply_causal_ripple(ripple_origin: Vector3, intensity_multiplier: float = 1.0):
	# Applies a decay ripple centered at ripple_origin, modifying the mesh and collision.
	if not mesh or not _collision_shape:
		return

	var current_mesh_arrays = (mesh as ArrayMesh).get_surface_arrays(0).duplicate(true)
	_mesh_data_tool.create_from_arrays(current_mesh_arrays)

	var effective_intensity = decay_intensity * intensity_multiplier
	var effective_radius = decay_radius

	for i in range(_mesh_data_tool.get_vertex_count()):
		var vertex_pos_local = _mesh_data_tool.get_vertex(i)
		var vertex_pos_global = global_transform.xform(vertex_pos_local)
		var distance = ripple_origin.distance_to(vertex_pos_global)

		if distance < effective_radius:
			var falloff = 1.0 - (distance / effective_radius)
			var displacement_amount = effective_intensity * falloff
			var normal = _mesh_data_tool.get_vertex_normal(i)
			# Displace vertex along its normal
			_mesh_data_tool.set_vertex(i, vertex_pos_local + normal * displacement_amount)

	var new_arrays = _mesh_data_tool.commit_to_arrays()
	(mesh as ArrayMesh).clear_surfaces()
	(mesh as ArrayMesh).add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, new_arrays)

	_update_collision_shape()
	_lose_memory_fragment()

func _update_collision_shape():
	# Updates the CollisionShape3D to match the modified mesh geometry.
	var new_shape = ConcavePolygonShape3D.new()
	new_shape.set_faces((mesh as ArrayMesh).get_surface_arrays(0)[Mesh.ARRAY_VERTEX])
	_collision_shape.shape = new_shape

func _lose_memory_fragment():
	# Removes a memory fragment from the list, simulating identity loss.
	if memory_fragments.size() > 0:
		var lost_fragment = memory_fragments.pop_front()
		print("Lost memory fragment: ", lost_fragment)
		# Emit a signal here for UI or narrative updates, e.g., emit_signal("memory_fragment_lost", lost_fragment)
	else:
		print("No more memory fragments to lose from this segment.")

# Example usage: Connect a signal from the player or an enemy to this function.
func _on_player_action_or_enemy_impact(action_position_global: Vector3, impact_intensity: float = 1.0):
	# This function would be called by external game logic (e.g., player movement, combat).
	apply_causal_ripple(action_position_global, impact_intensity)
