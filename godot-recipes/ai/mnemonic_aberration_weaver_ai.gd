extends Node3D

class_name AberrationWeaverAI

signal memory_transformed(fragment_node, hostile_node)

@export var corruption_radius: float = 10.0
@export var corruption_rate: float = 0.1 # Corruption progress per second
@export var max_corruption_level: float = 1.0
@export var hostile_mesh: Mesh # Mesh for transformed entity
@export var hostile_material: Material # Material for transformed entity
@export var corruption_shader: Shader # Reference to the corruption shader resource (.gdshader)

var _corrupted_fragments: Dictionary = {} # { MeshInstance3D: current_corruption_level }

func _physics_process(delta: float) -> void:
	_process_corruption_field(delta)

func _process_corruption_field(delta: float) -> void:
	var fragments_in_range = _get_fragments_in_range()
	var fragments_to_remove = []

	# Update existing corrupted fragments and identify those out of range
	for fragment_node in _corrupted_fragments.keys():
		if not is_instance_valid(fragment_node) or fragment_node not in fragments_in_range:
			fragments_to_remove.append(fragment_node)
			continue

		_update_fragment_corruption(fragment_node, delta)

	# Remove fragments no longer in range or invalid
	for fragment_node in fragments_to_remove:
		_clean_up_fragment(fragment_node)

	# Initiate corruption for new fragments in range
	for fragment_node in fragments_in_range:
		if not _corrupted_fragments.has(fragment_node):
			_initiate_fragment_corruption(fragment_node)

func _get_fragments_in_range() -> Array[MeshInstance3D]:
	var fragments = []
	for node in get_tree().get_nodes_in_group("memory_fragments"):
		if node is MeshInstance3D and global_position.distance_to(node.global_position) < corruption_radius:
			fragments.append(node)
	return fragments

func _initiate_fragment_corruption(fragment_node: MeshInstance3D) -> void:
	_corrupted_fragments[fragment_node] = 0.0
	var original_material = fragment_node.get_active_material(0)
	if original_material and corruption_shader:
		var new_shader_material = ShaderMaterial.new()
		new_shader_material.shader = corruption_shader
		# Attempt to copy base texture/color from original material
		if original_material is StandardMaterial3D:
			new_shader_material.set_shader_parameter("albedo_texture", original_material.albedo_texture)
			new_shader_material.set_shader_parameter("albedo_color", original_material.albedo_color)
		new_shader_material.set_shader_parameter("corruption_level", 0.0)
		fragment_node.set_surface_override_material(0, new_shader_material)
	# Narrative corruption placeholder: MemoryResource.start_corruption()

func _update_fragment_corruption(fragment_node: MeshInstance3D, delta: float) -> void:
	var current_level = _corrupted_fragments[fragment_node]
	current_level += corruption_rate * delta
	_corrupted_fragments[fragment_node] = min(current_level, max_corruption_level)

	var shader_material = fragment_node.get_active_material(0) as ShaderMaterial
	if shader_material and shader_material.shader == corruption_shader:
		shader_material.set_shader_parameter("corruption_level", _corrupted_fragments[fragment_node])

	if _corrupted_fragments[fragment_node] >= max_corruption_level:
		_transform_fragment(fragment_node)

func _transform_fragment(fragment_node: MeshInstance3D) -> void:
	if not is_instance_valid(fragment_node):
		return

	_clean_up_fragment(fragment_node) # Remove from tracking and reset material

	var hostile_entity = MeshInstance3D.new()
	hostile_entity.mesh = hostile_mesh
	hostile_entity.material_override = hostile_material
	hostile_entity.global_transform = fragment_node.global_transform
	get_parent().add_child(hostile_entity)

	fragment_node.queue_free()
	emit_memory_transformed(fragment_node, hostile_entity)

	# Narrative corruption placeholder: MemoryResource.complete_corruption()

func _clean_up_fragment(fragment_node: MeshInstance3D) -> void:
	if _corrupted_fragments.has(fragment_node):
		_corrupted_fragments.erase(fragment_node)
		if is_instance_valid(fragment_node):
			fragment_node.set_surface_override_material(0, null) # Remove override
		# Narrative corruption placeholder: MemoryResource.stop_corruption()