extends Node3D

@export var lyra_node: CharacterBody3D
@export var erosion_speed_threshold: float = 10.0
@export var erosion_radius: float = 1.5
@export var erosion_depth: float = 0.5
@export var erosion_cooldown: float = 0.1
@export_flags_3d_physics var memory_substrate_layer: int = 1 # Physics layer for memory terrain

var _last_erosion_time: float = 0.0
var _space_state: PhysicsDirectSpaceState3D

func _ready() -> void:
	if not lyra_node:
		push_error("MnemonicVelocityErosion: 'lyra_node' not assigned.")
		set_process(false)
		return
	_space_state = get_world_3d().direct_space_state

func _physics_process(delta: float) -> void:
	if lyra_node.velocity.length() > erosion_speed_threshold:
		if Engine.get_process_uptime_seconds() - _last_erosion_time > erosion_cooldown:
			_perform_erosion()
			_last_erosion_time = Engine.get_process_uptime_seconds()

func _perform_erosion() -> void:
	var query = PhysicsShapeQueryParameters3D.new()
	query.shape = SphereShape3D.new()
	query.shape.radius = erosion_radius
	query.transform = Transform3D(Basis(), lyra_node.global_position)
	query.collision_mask = memory_substrate_layer
	query.exclude = [lyra_node]

	var results = _space_state.intersect_shape(query)

	for result in results:
		var collider = result.collider
		if collider is StaticBody3D:
			var mesh_instance: MeshInstance3D = null
			var collision_shape_node: CollisionShape3D = null

			# Find MeshInstance3D and CollisionShape3D children of the StaticBody3D
			for child in collider.get_children():
				if child is MeshInstance3D:
					mesh_instance = child
				elif child is CollisionShape3D:
					collision_shape_node = child
			
			if mesh_instance and mesh_instance.mesh is ArrayMesh:
				_erode_mesh(mesh_instance, lyra_node.global_position)
				if collision_shape_node:
					# Update collision shape after mesh modification
					collision_shape_node.shape = mesh_instance.mesh.create_trimesh_shape()

func _erode_mesh(mesh_instance: MeshInstance3D, global_erosion_pos: Vector3) -> void:
	var mesh: ArrayMesh = mesh_instance.mesh
	var mesh_data_tool = MeshDataTool.new()
	mesh_data_tool.create_from_mesh(mesh, 0) # Assuming surface 0 for modification

	var local_erosion_pos = mesh_instance.to_local(global_erosion_pos)

	for i in range(mesh_data_tool.get_vertex_count()):
		var vertex_pos = mesh_data_tool.get_vertex(i)
		var distance = vertex_pos.distance_to(local_erosion_pos)

		if distance < erosion_radius:
			var falloff = 1.0 - (distance / erosion_radius) # Smoother erosion effect
			var new_y = vertex_pos.y - erosion_depth * falloff
			mesh_data_tool.set_vertex(i, Vector3(vertex_pos.x, new_y, vertex_pos.z))
	
	mesh_data_tool.commit_to_mesh(mesh)
