@tool
class_name SynapticErosionScape extends Node3D

@export var erosion_speed: float = 0.5 # Units per second for vertex displacement
@export var erosion_radius: float = 10.0 # Radius around erosion_center to affect
@export var memory_integrity_factor: float = 1.0 # Multiplier for erosion speed (0.0-1.0, lower means faster erosion)
@export var re_solidify_duration: float = 5.0 # How long a path stays re-solidified
@export var mesh_instance_path: NodePath # Path to the MeshInstance3D node holding the terrain
@export var debris_scene: PackedScene # Scene for falling debris (e.g., a RigidBody3D with a MeshInstance3D)
@export var navigation_region_path: NodePath # Path to the NavigationRegion3D node to update

var _mesh_instance: MeshInstance3D
var _array_mesh: ArrayMesh
var _original_mesh_arrays: Array # Stores original vertex data
var _current_mesh_arrays: Array # Stores current mutable vertex data
var _re_solidified_areas: Dictionary = {} # {id: {position: Vector3, radius: float, timer: float}}
var _erosion_center: Vector3 = Vector3.ZERO # Where erosion originates (e.g., Lyra's position)

const ERODED_VERTEX_Y_THRESHOLD: float = -100.0 # Vertices below this are considered "eroded"

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_mesh_instance = get_node_or_null(mesh_instance_path)
	if not _mesh_instance or not _mesh_instance.mesh is ArrayMesh:
		push_error("MeshInstance3D with ArrayMesh not found at path: %s" % mesh_instance_path)
		set_process(false)
		return

	_array_mesh = _mesh_instance.mesh
	_original_mesh_arrays = _array_mesh.surface_get_arrays(0).duplicate(true)
	_current_mesh_arrays = _array_mesh.surface_get_arrays(0).duplicate(true)

	var nav_region: NavigationRegion3D = get_node_or_null(navigation_region_path)
	if nav_region:
		_update_navigation_mesh()

func _process(delta: float) -> void:
	_update_erosion(delta)
	_update_re_solidification(delta)
	_array_mesh.surface_set_arrays(0, _current_mesh_arrays)
	_update_navigation_mesh()

func set_erosion_center(center: Vector3) -> void:
	_erosion_center = center

func set_memory_integrity(integrity: float) -> void:
	memory_integrity_factor = clampf(integrity, 0.0, 1.0)

func re_solidify_path(position: Vector3, radius: float) -> void:
	var id = hash(str(position) + str(radius)) # Simple ID for tracking
	_re_solidified_areas[id] = {"position": position, "radius": radius, "timer": re_solidify_duration}

	var positions: PackedVector3Array = _current_mesh_arrays[ArrayMesh.ARRAY_VERTEX]
	var original_positions: PackedVector3Array = _original_mesh_arrays[ArrayMesh.ARRAY_VERTEX]

	for i in range(positions.size()):
		if positions[i].distance_to(position) < radius:
			positions[i] = original_positions[i] # Restore original position

	_current_mesh_arrays[ArrayMesh.ARRAY_VERTEX] = positions
	_update_navigation_mesh()

func _update_erosion(delta: float) -> void:
	var positions: PackedVector3Array = _current_mesh_arrays[ArrayMesh.ARRAY_VERTEX]
	var original_positions: PackedVector3Array = _original_mesh_arrays[ArrayMesh.ARRAY_VERTEX]
	var erosion_rate = erosion_speed * (1.0 - memory_integrity_factor) * delta

	var new_positions = PackedVector3Array()
	new_positions.resize(positions.size())

	for i in range(positions.size()):
		var current_pos = positions[i]

		var is_re_solidified = false
		for area_data in _re_solidified_areas.values():
			if current_pos.distance_to(area_data.position) < area_data.radius:
				is_re_solidified = true
				break

		if is_re_solidified:
			new_positions[i] = current_pos # Don't erode if re-solidified
			continue

		if current_pos.distance_to(_erosion_center) < erosion_radius:
			if current_pos.y > ERODED_VERTEX_Y_THRESHOLD:
				new_positions[i] = current_pos + Vector3(0, -erosion_rate, 0)
			else:
				new_positions[i] = current_pos # Already eroded, keep it low
		else:
			new_positions[i] = current_pos # No erosion, keep current

		if positions[i].y > ERODED_VERTEX_Y_THRESHOLD and new_positions[i].y <= ERODED_VERTEX_Y_THRESHOLD:
			_spawn_debris(positions[i]) # Spawn debris at the vertex position

	_current_mesh_arrays[ArrayMesh.ARRAY_VERTEX] = new_positions

func _update_re_solidification(delta: float) -> void:
	var to_remove: Array = []
	for id in _re_solidified_areas.keys():
		_re_solidified_areas[id].timer -= delta
		if _re_solidified_areas[id].timer <= 0:
			to_remove.append(id)

	for id in to_remove:
		_re_solidified_areas.erase(id)

func _spawn_debris(position: Vector3) -> void:
	if not debris_scene:
		return

	var debris_instance = debris_scene.instantiate()
	if debris_instance is RigidBody3D:
		debris_instance.global_transform.origin = _mesh_instance.global_transform.xform(position)
		get_tree().current_scene.add_child(debris_instance)
		debris_instance.apply_central_impulse(Vector3(randf_range(-1, 1), -1, randf_range(-1, 1)) * 0.5)
	else:
		debris_instance.queue_free()

func _update_navigation_mesh() -> void:
	var nav_region: NavigationRegion3D = get_node_or_null(navigation_region_path)
	if not nav_region:
		return

	# This is a highly simplified and expensive way to update navigation.
	# For real-time dynamic terrain, consider:
	# 1. Using NavigationObstacle3D for small, localized changes.
	# 2. Breaking the terrain into smaller NavigationRegion3D chunks and updating only affected ones.
	# 3. Custom NavigationMesh generation logic.
	
	var temp_mesh_instance = MeshInstance3D.new()
	temp_mesh_instance.mesh = _array_mesh
	temp_mesh_instance.global_transform = _mesh_instance.global_transform
	
	var source_geometry = NavigationMeshSourceGeometryData3D.new()
	source_geometry.parse_geometry_from_mesh_instance(temp_mesh_instance)
	
	NavigationServer3D.region_set_navigation_mesh_source_geometry_data(nav_region.get_rid(), source_geometry)
	
	temp_mesh_instance.queue_free()
