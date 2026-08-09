@tool
extends MeshInstance3D

var current_mesh_data: Array
var original_vertices: PackedVector3Array
var original_normals: PackedVector3Array

@export var deformation_strength_memory_loss: float = 0.5
@export var deformation_strength_silence: float = 0.3
@export var deformation_radius: float = 5.0
@export var nav_region_path: NodePath

var nav_region: NavigationRegion3D

func _ready() -> void:
	if Engine.is_editor_hint(): return
	
	if is_instance_valid(mesh):
		_initialize_mesh_data()
		
	if nav_region_path:
		nav_region = get_node_or_null(nav_region_path)
		if nav_region and is_instance_valid(mesh):
			_update_navigation_mesh()

func _initialize_mesh_data() -> void:
	var surface_count = mesh.get_surface_count()
	if surface_count > 0:
		var base_arrays = mesh.surface_get_arrays(0)
		original_vertices = base_arrays[ArrayMesh.ARRAY_VERTEX]
		original_normals = base_arrays[ArrayMesh.ARRAY_NORMAL]
		current_mesh_data = base_arrays.duplicate(true)
		
		if not get_surface_override_material(0):
			var mat = ShaderMaterial.new()
			mat.shader = preload("res://shaders/visceral_memory_shader.gdshader")
			set_surface_override_material(0, mat)

func _deform_mesh(center: Vector3, radius: float, direction_multiplier: float) -> void:
	if current_mesh_data.empty(): return

	var vertices: PackedVector3Array = current_mesh_data[ArrayMesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = current_mesh_data[ArrayMesh.ARRAY_NORMAL]
	var new_vertices: PackedVector3Array = vertices.duplicate()
	
	for i in range(new_vertices.size()):
		var vertex_pos = global_transform.xform(vertices[i])
		var dist = center.distance_to(vertex_pos)
		
		if dist < radius:
			var strength = (1.0 - (dist / radius)) * direction_multiplier
			new_vertices[i] += normals[i] * strength
			
	current_mesh_data[ArrayMesh.ARRAY_VERTEX] = new_vertices
	
	var new_mesh = ArrayMesh.new()
	new_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, current_mesh_data)
	self.mesh = new_mesh
	
	_update_collision_shape(new_mesh)
	_update_navigation_mesh()

func lose_memory(position: Vector3) -> void:
	_deform_mesh(position, deformation_radius, -deformation_strength_memory_loss)

func silence_proximity_effect(position: Vector3) -> void:
	_deform_mesh(position, deformation_radius, deformation_strength_silence)

func _update_collision_shape(new_mesh: ArrayMesh) -> void:
	for child in get_children():
		if child is StaticBody3D:
			child.queue_free()
			
	var static_body = StaticBody3D.new()
	add_child(static_body)
	static_body.owner = self
	
	var collision_shape = CollisionShape3D.new()
	static_body.add_child(collision_shape)
	collision_shape.owner = self
	
	var trimesh_shape = ConcavePolygonShape3D.new()
	trimesh_shape.set_faces(new_mesh.get_faces())
	collision_shape.shape = trimesh_shape

func _update_navigation_mesh() -> void:
	if not nav_region or not is_instance_valid(mesh): return
	
	var source_geometry = NavigationMeshSourceGeometryData3D.new()
	source_geometry.add_mesh(mesh, global_transform)
	
	var new_nav_mesh = NavigationMesh.new()
	NavigationMeshGenerator.bake_from_source_geometry_data(new_nav_mesh, source_geometry, nav_region.navigation_mesh)
	nav_region.navigation_mesh = new_nav_mesh