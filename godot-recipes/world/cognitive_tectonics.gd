@tool
extends Node3D

# Parameters
@export_range(0.0, 1.0, 0.01) var identity_integrity: float = 1.0:
	set(value):
		identity_integrity = clampf(value, 0.0, 1.0)
		_queue_mesh_update()
@export var terrain_size: Vector2i = Vector2i(32, 32):
	set(value):
		terrain_size = value.max(Vector2i(2, 2))
		_queue_mesh_update()
@export var cell_size: float = 1.0:
	set(value):
		cell_size = maxf(0.1, value)
		_queue_mesh_update()
@export var height_strength: float = 5.0:
	set(value):
		height_strength = maxf(0.0, value)
		_queue_mesh_update()
@export var noise_scale: float = 0.1:
	set(value):
		noise_scale = maxf(0.01, value)
		_queue_mesh_update()
@export var dissolve_threshold: float = 0.5:
	set(value):
		dissolve_threshold = clampf(value, 0.0, 1.0)
		_queue_mesh_update()
@export var mesh_material: Material

# Internal nodes
var _mesh_instance: MeshInstance3D
var _static_body: StaticBody3D
var _collision_shape: CollisionShape3D
var _noise: FastNoiseLite = FastNoiseLite.new()
var _current_mesh: ArrayMesh
var _update_queued: bool = false

func _ready():
	_setup_nodes()
	_noise.seed = randi()
	_noise.noise_type = FastNoiseLite.TYPE_PERLIN
	_noise.frequency = noise_scale
	_queue_mesh_update()

func _process(delta):
	if _update_queued:
		_update_queued = false
		_generate_and_update_mesh()
	
	if mesh_material is ShaderMaterial:
		var shader_material = mesh_material as ShaderMaterial
		shader_material.set_shader_parameter("dissolve_factor", 1.0 - identity_integrity)
		shader_material.set_shader_parameter("dissolve_threshold", dissolve_threshold)

func _setup_nodes():
	if not _mesh_instance:
		_mesh_instance = MeshInstance3D.new()
		add_child(_mesh_instance)
		_mesh_instance.owner = get_owner()
	if not _static_body:
		_static_body = StaticBody3D.new()
		add_child(_static_body)
		_static_body.owner = get_owner()
	if not _collision_shape:
		_collision_shape = CollisionShape3D.new()
		_static_body.add_child(_collision_shape)
		_collision_shape.owner = get_owner()

func _queue_mesh_update():
	_update_queued = true

func _generate_and_update_mesh():
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	
	for x in range(terrain_size.x):
		for z in range(terrain_size.y):
			var v0 = Vector3(x * cell_size, 0, z * cell_size)
			var v1 = Vector3((x + 1) * cell_size, 0, z * cell_size)
			var v2 = Vector3(x * cell_size, 0, (z + 1) * cell_size)
			var v3 = Vector3((x + 1) * cell_size, 0, (z + 1) * cell_size)
			
			var h0 = _get_vertex_height(v0)
			var h1 = _get_vertex_height(v1)
			var h2 = _get_vertex_height(v2)
			var h3 = _get_vertex_height(v3)
			
			v0.y = h0
			v1.y = h1
			v2.y = h2
			v3.y = h3
			
			st.add_vertex(v0)
			st.add_vertex(v2)
			st.add_vertex(v1)
			
			st.add_vertex(v1)
			st.add_vertex(v2)
			st.add_vertex(v3)
	
	st.generate_normals()
	_current_mesh = st.commit()
	
	_mesh_instance.mesh = _current_mesh
	_mesh_instance.set_surface_override_material(0, mesh_material)
	
	_update_collision_shape()

func _get_vertex_height(pos: Vector3) -> float:
	var noise_val = _noise.get_noise_2d(pos.x * _noise.frequency, pos.z * _noise.frequency)
	
	var normal_height = noise_val * height_strength
	
	var dissolved_noise_val = _noise.get_noise_2d(pos.x * _noise.frequency * 2.0, pos.z * _noise.frequency * 2.0)
	var dissolved_height = (dissolved_noise_val * height_strength * 0.5) - (height_strength * 0.75)
	
	var dissolve_factor = 1.0 - identity_integrity
	return lerpf(normal_height, dissolved_height, dissolve_factor)

func _update_collision_shape():
	if _current_mesh and _collision_shape:
		var trimesh_shape = ConcavePolygonShape3D.new()
		trimesh_shape.set_faces(_current_mesh.get_faces())
		_collision_shape.shape = trimesh_shape