@tool
extends Node3D

# Signals
signal memory_lost_effect_triggered(memory_id: String, obstacle_node: Node3D)

# Exported properties for configuration
@export_category("Memory Fissure Architect Settings")
@export var player_node_path: NodePath
@export var navigation_region_path: NodePath
@export var memory_loss_threshold: float = 0.1 # How much memory loss (0.0-1.0) triggers a new fissure
@export var fissure_trap_scenes: Array[PackedScene] # Array of PackedScenes for different traps
@export var fissure_wall_scenes: Array[PackedScene] # Array of PackedScenes for different walls
@export var fissure_spawn_radius: float = 10.0 # Radius around player to spawn fissures

# Internal state
var _player_node: Node3D
var _navigation_region: NavigationRegion3D
var _last_memory_integrity: float = 1.0 # Assume full memory at start
var _active_fissures: Array[Node3D]

func _ready() -> void:
	_setup_dependencies()
	if Engine.is_editor_hint():
		return
	
	# Connect to player's memory system (assuming player has a 'memory_integrity_changed' signal)
	if _player_node and _player_node.has_signal("memory_integrity_changed"):
		_player_node.memory_integrity_changed.connect(_on_player_memory_integrity_changed)
	else:
		push_warning("Player node or 'memory_integrity_changed' signal not found. Architect will not function.")

func _setup_dependencies() -> void:
	if player_node_path:
		_player_node = get_node_or_null(player_node_path)
	if navigation_region_path:
		_navigation_region = get_node_or_null(navigation_region_path)

func _on_player_memory_integrity_changed(current_integrity: float) -> void:
	# Check if memory integrity has dropped significantly enough to trigger a fissure
	if _last_memory_integrity - current_integrity >= memory_loss_threshold:
		_trigger_memory_fissure(current_integrity)
		_last_memory_integrity = current_integrity

func _trigger_memory_fissure(current_integrity: float) -> void:
	if not _player_node:
		return

	var fissure_type: String = _determine_fissure_type(current_integrity)
	var spawn_position: Vector3 = _calculate_spawn_position(_player_node.global_position)

	var selected_scene: PackedScene
	if fissure_type == "trap" and not fissure_trap_scenes.is_empty():
		selected_scene = fissure_trap_scenes.pick_random()
	elif fissure_type == "wall" and not fissure_wall_scenes.is_empty():
		selected_scene = fissure_wall_scenes.pick_random()
	else:
		push_warning("No suitable fissure scene found for type: %s" % fissure_type)
		return

	if selected_scene:
		var fissure_instance: Node3D = selected_scene.instantiate()
		fissure_instance.global_position = spawn_position
		add_child(fissure_instance)
		_active_fissures.append(fissure_instance)
		_update_navigation_obstacles(fissure_instance)
		emit_signal("memory_lost_effect_triggered", fissure_type, fissure_instance)
		print("Generated %s fissure at %s due to memory loss." % [fissure_type, spawn_position])

func _determine_fissure_type(current_integrity: float) -> String:
	# Simple logic: more memory loss -> more walls, less memory loss -> more traps
	# This can be expanded with more complex rules based on specific lost memories
	if current_integrity < 0.5:
		return "wall" # More significant memory loss creates blocking walls
	else:
		return "trap" # Less significant loss creates traps

func _calculate_spawn_position(player_position: Vector3) -> Vector3:
	# Find a random position around the player within the spawn radius
	# For a robust solution, consider raycasting downwards and snapping to NavMesh.
	var random_offset: Vector3 = Vector3(
		randf_range(-fissure_spawn_radius, fissure_spawn_radius),
		0, # Assuming flat ground for simplicity, adjust for 3D environments
		randf_range(-fissure_spawn_radius, fissure_spawn_radius)
	)
	var spawn_pos: Vector3 = player_position + random_offset
	return spawn_pos

func _update_navigation_obstacles(new_obstacle: Node3D) -> void:
	# If the instantiated obstacle contains a NavigationObstacle3D, it will automatically
	# affect the NavigationRegion3D it's within. No explicit NavMesh modification needed here.
	# This function serves as a placeholder for potential future explicit NavMesh updates
	# or to ensure the obstacle is correctly added to the navigation system.
	pass # The NavigationObstacle3D handles itself when added to the scene tree.

# Optional: Cleanup fissures if they are temporary or if Lyra recovers memory
func _cleanup_fissure(fissure_node: Node3D) -> void:
	if fissure_node and fissure_node.is_inside_tree():
		fissure_node.queue_free()
		_active_fissures.erase(fissure_node)
