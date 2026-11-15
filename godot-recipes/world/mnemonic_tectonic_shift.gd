@tool
class_name MemoryBlock extends Node3D

@export_range(0.0, 1.0, 0.01)
var memory_coherence: float = 1.0:
	set(value):
		memory_coherence = clampf(value, 0.0, 1.0)
		if is_node_ready():
			_update_block_geometry()

@export var block_size: Vector3 = Vector3(1.0, 1.0, 1.0)
@export var material: Material

var _mesh_instance: MeshInstance3D
var _collision_shape: CollisionShape3D
var _base_cube_vertices: PackedVector3Array
var _cube_face_indices: PackedInt32Array

func _ready() -> void:
	_ensure_children_exist()
	_initialize_base_geometry()
	_update_block_geometry()

func _ensure_children_exist() -> void:
	if not _mesh_instance:
		_mesh_instance = MeshInstance3D.new()
		_mesh_instance.name = "Mesh"
		add_child(_mesh_instance)
		_mesh_instance.owner = get_owner()
	if not _collision_shape:
		_collision_shape = CollisionShape3D.new()
		_collision_shape.name = "Collision"
		add_child(_collision_shape)
		_collision_shape.owner = get_owner()

func _initialize_base_geometry() -> void:
	var hx = block_size.x / 2.0
	var hy = block_size.y / 2.0
	var hz = block_size.z / 2.0

	_base_cube_vertices = PackedVector3Array([
		Vector3(-hx, -hy, -hz), Vector3(hx, -hy, -hz), Vector3(hx, hy, -hz), Vector3(-hx, hy, -hz),
		Vector3(-hx, -hy, hz), Vector3(hx, -hy, hz), Vector3(hx, hy, hz), Vector3(hx, hy, hz)
	])

	_cube_face_indices = PackedInt32Array([
		0, 1, 2, 2, 3, 0, # Front
		5, 4, 7, 7, 6, 5, # Back
		3, 2, 6, 6, 7, 3, # Top
		4, 5, 1, 1, 0, 4, # Bottom
		1, 5, 6, 6, 2, 1, # Right
		4, 0, 3, 3, 7, 4  # Left
	])

func _update_block_geometry() -> void:
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_material(material)

	if memory_coherence > 0.7:
		_transform_stable(st)
	elif memory_coherence > 0.3:
		_transform_crumbling(st)
	else:
		_transform_dissolving(st)

	st.index()
	var new_mesh = st.commit()
	_mesh_instance.mesh = new_mesh
	_create_collision_shape(new_mesh)

func _transform_stable(st: SurfaceTool) -> void:
	for i in range(_cube_face_indices.size()):
		st.add_vertex(_base_cube_vertices[_cube_face_indices[i]])

func _transform_crumbling(st: SurfaceTool) -> void:
	var rng = RandomNumberGenerator.new()
	rng.seed = hash(global_position) # Consistent randomness per block
	var deform_factor = 1.0 - memory_coherence # More deformation for lower coherence

	for i in range(_cube_face_indices.size()):
		var base_v = _base_cube_vertices[_cube_face_indices[i]]
		var deformed_v = base_v
		deformed_v.x += rng.randf_range(-deform_factor * 0.1, deform_factor * 0.1) * block_size.x
		deformed_v.y += rng.randf_range(-deform_factor * 0.1, deform_factor * 0.1) * block_size.y
		deformed_v.z += rng.randf_range(-deform_factor * 0.1, deform_factor * 0.1) * block_size.z
		st.add_vertex(deformed_v)

func _transform_dissolving(st: SurfaceTool) -> void:
	var scale_factor = memory_coherence * 0.1 # Scales to 0.0-0.03
	if scale_factor < 0.01: # Effectively invisible
		return

	var hx = block_size.x / 2.0 * scale_factor
	var hy = block_size.y / 2.0 * scale_factor
	var hz = block_size.z / 2.0 * scale_factor

	var scaled_vertices = PackedVector3Array([
		Vector3(-hx, -hy, -hz), Vector3(hx, -hy, -hz), Vector3(hx, hy, -hz), Vector3(-hx, hy, -hz),
		Vector3(-hx, -hy, hz), Vector3(hx, -hy, hz), Vector3(hx, hy, hz), Vector3(hx, hy, hz)
	])

	for i in range(_cube_face_indices.size()):
		st.add_vertex(scaled_vertices[_cube_face_indices[i]])

func _create_collision_shape(mesh: ArrayMesh) -> void:
	var collision_shape = ConcavePolygonShape3D.new()
	collision_shape.set_mesh(mesh)
	_collision_shape.shape = collision_shape