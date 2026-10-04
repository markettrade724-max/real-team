@tool
extends Node3D

# --- Exported Parameters ---
@export var grid_size: Vector2i = Vector2i(20, 20)
@export var tile_size: float = 2.0
@export var initial_coherence: float = 1.0
@export var coherence_decay_rate: float = 0.05
@export var hunter_decay_multiplier: float = 2.0
@export var shard_reinforce_amount: float = 0.3
@export var min_coherence_for_passable: float = 0.2
@export var erosion_shader: ShaderMaterial
@export var base_tile_mesh: Mesh # e.g., a BoxMesh, will be converted to ArrayMesh

# --- Internal State ---
var _tiles: Dictionary = {} # Stores {Vector2i(grid_x, grid_y): {mesh_instance, collision_shape, coherence, nav_obstacle_id, original_vertices}}
var _navigation_region: NavigationRegion3D
var _player_node: Node3D # Placeholder for Lyra
var _hunter_nodes: Array[Node3D] # Placeholder for Silence hunters

# --- Godot Lifecycle ---
func _ready() -> void:
	if Engine.is_editor_hint(): return
	_setup_grid()
	_setup_navigation()
	# Placeholder: In a real game, these would be passed or found dynamically
	_player_node = get_tree().get_first_node_in_group("player")
	_hunter_nodes = get_tree().get_nodes_in_group("hunters")

func _process(delta: float) -> void:
	if Engine.is_editor_hint(): return
	_update_tile_coherence(delta)
	_update_navigation_obstacles()

# --- Grid Management ---
func _setup_grid() -> void:
	for x in range(grid_size.x):
		for y in range(grid_size.y):
			var grid_pos = Vector2i(x, y)
			var world_pos = Vector3(x * tile_size, 0, y * tile_size)
			
			var mesh_instance = MeshInstance3D.new()
			var array_mesh = ArrayMesh.new()
			if base_tile_mesh:
				array_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, base_tile_mesh.get_surface_arrays(0))
			mesh_instance.mesh = array_mesh
			mesh_instance.position = world_pos
			mesh_instance.set_surface_override_material(0, erosion_shader.duplicate()) # Duplicate for unique uniforms
			add_child(mesh_instance)

			var collision_shape = CollisionShape3D.new()
			var box_shape = BoxShape3D.new()
			box_shape.size = Vector3(tile_size, 1.0, tile_size) # Assume flat tiles
			collision_shape.shape = box_shape
			mesh_instance.add_child(collision_shape) # Attach to mesh_instance for local transform
			collision_shape.position = Vector3(0, -0.5, 0) # Center collision on top of mesh

			var original_vertices = []
			if array_mesh.get_surface_count() > 0:
				original_vertices = array_mesh.get_surface_arrays(0)[ArrayMesh.ARRAY_VERTEX].duplicate()

			_tiles[grid_pos] = {
				"mesh_instance": mesh_instance,
				"collision_shape": collision_shape,
				"coherence": initial_coherence,
				"nav_obstacle_id": -1,
				"original_vertices": original_vertices
			}
			_update_tile_state(grid_pos)

func _setup_navigation() -> void:
	_navigation_region = NavigationRegion3D.new()
	add_child(_navigation_region)

# --- Coherence Logic ---
func _update_tile_coherence(delta: float) -> void:
	var player_world_pos = _player_node.global_position if _player_node else Vector3.INF
	var hunter_world_positions = []
	for hunter in _hunter_nodes:
		if hunter: hunter_world_positions.append(hunter.global_position)

	for grid_pos in _tiles:
		var tile_data = _tiles[grid_pos]
		var current_coherence = tile_data.coherence
		var tile_world_pos = tile_data.mesh_instance.global_position

		# Base decay
		var decay = coherence_decay_rate * delta

		# Hunter proximity decay
		for hunter_pos in hunter_world_positions:
			if tile_world_pos.distance_to(hunter_pos) < tile_size * 2.0: # Hunters accelerate decay
				decay += coherence_decay_rate * hunter_decay_multiplier * delta
				break # Only one hunter needed to accelerate decay

		current_coherence = max(0.0, current_coherence - decay)
		tile_data.coherence = current_coherence
		_update_tile_state(grid_pos)

func _update_tile_state(grid_pos: Vector2i) -> void:
	var tile_data = _tiles[grid_pos]
	var mesh_instance = tile_data.mesh_instance
	var collision_shape = tile_data.collision_shape
	var coherence = tile_data.coherence
	
	# Update Shader Material
	var material = mesh_instance.get_surface_override_material(0) as ShaderMaterial
	if material:
		material.set_shader_parameter("coherence", coherence)
		material.set_shader_parameter("tile_size", tile_size) # Pass tile_size for shader effects

	# Update Mesh Data (Y-axis shrink using ArrayMesh)
	var array_mesh = mesh_instance.mesh as ArrayMesh
	if array_mesh and array_mesh.get_surface_count() > 0:
		var arrays = array_mesh.get_surface_arrays(0)
		var original_vertices = tile_data.original_vertices
		
		var new_vertices = PackedVector3Array()
		for i in range(original_vertices.size()):
			var v = original_vertices[i]
			new_vertices.append(Vector3(v.x, v.y * coherence, v.z)) # Shrink Y based on coherence
		
		arrays[ArrayMesh.ARRAY_VERTEX] = new_vertices
		array_mesh.clear_surfaces()
		array_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)

	# Update Collision Shape
	var is_passable = coherence >= min_coherence_for_passable
	collision_shape.set_deferred("disabled", not is_passable)
	
	# Visually shrink collision for partial erosion
	if collision_shape.shape is BoxShape3D:
		var box_shape = collision_shape.shape as BoxShape3D
		var target_y_scale = max(0.01, coherence) # Shrink height with coherence
		box_shape.size = Vector3(tile_size, target_y_scale, tile_size)
		collision_shape.position = Vector3(0, -0.5 * target_y_scale, 0) # Adjust position to stay on ground

# --- Navigation Obstacle Management ---
func _update_navigation_obstacles() -> void:
	for grid_pos in _tiles:
		var tile_data = _tiles[grid_pos]
		var is_passable = tile_data.coherence >= min_coherence_for_passable
		var current_obstacle_id = tile_data.nav_obstacle_id
		var tile_world_pos = tile_data.mesh_instance.global_position

		if not is_passable and current_obstacle_id == -1:
			# Tile became impassable, add as obstacle
			var obstacle_id = NavigationServer3D.obstacle_add(true) # true for 3D
			NavigationServer3D.obstacle_set_position(obstacle_id, tile_world_pos)
			NavigationServer3D.obstacle_set_radius(obstacle_id, tile_size * 0.5) # Radius for circular obstacle
			tile_data.nav_obstacle_id = obstacle_id
		elif is_passable and current_obstacle_id != -1:
			# Tile became passable, remove obstacle
			NavigationServer3D.obstacle_remove(current_obstacle_id)
			tile_data.nav_obstacle_id = -1

# --- Player Actions ---
func _get_grid_pos_from_world_pos(world_pos: Vector3) -> Vector2i:
	var local_pos = to_local(world_pos)
	var x = floori(local_pos.x / tile_size)
	var y = floori(local_pos.z / tile_size)
	return Vector2i(x, y)

func _on_memory_shard_recovered(world_pos: Vector3) -> void:
	var center_grid_pos = _get_grid_pos_from_world_pos(world_pos)
	for x_offset in range(-1, 2):
		for y_offset in range(-1, 2):
			var grid_pos = center_grid_pos + Vector2i(x_offset, y_offset)
			if _tiles.has(grid_pos):
				var tile_data = _tiles[grid_pos]
				tile_data.coherence = min(1.0, tile_data.coherence + shard_reinforce_amount)
				_update_tile_state(grid_pos)

func anchor_ground(world_pos: Vector3, cost: int) -> void:
	# This function would be called by Lyra's script, deducting 'cost' from her resources.
	# For now, just reinforce.
	_on_memory_shard_recovered(world_pos) # Re-use shard logic for simplicity
	# In a real game, 'cost' would be used here.