@tool
extends CharacterBody3D

class_name MnemicCuratorReclaimerAI

# Parameters for the Archivist's behavior
@export_range(1.0, 10.0, 0.1) var _movement_speed: float = 3.0
@export_range(0.5, 5.0, 0.1) var _reclamation_range: float = 1.5
@export_range(0.5, 5.0, 0.1) var _cleansing_duration: float = 2.0
@export var _memory_fragment_group: String = "memory_fragments"
@export var _cleansed_material: Material # Assign a custom shader material here

# Node references
@onready var _navigation_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _detection_area: Area3D = $DetectionArea

var _current_target_fragment: PhysicsBody3D = null
var _is_cleansing: bool = false
var _cleansing_timer: float = 0.0
var _lyra_node: CharacterBody3D = null # Reference to Lyra, set externally or found

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_navigation_agent.path_desired_distance = 0.5
	_navigation_agent.target_desired_distance = _reclamation_range * 0.8
	_navigation_agent.velocity_computed.connect(_on_velocity_computed)
	_detection_area.body_entered.connect(_on_detection_area_body_entered)
	_detection_area.body_exited.connect(_on_detection_area_body_exited)

func _physics_process(delta: float) -> void:
	if Engine.is_editor_hint():
		return

	_update_target()
	_handle_movement(delta)
	_handle_cleansing(delta)

func _update_target() -> void:
	if _is_cleansing:
		return

	# Prioritize fragments held by Lyra
	if _lyra_node and _lyra_node.has_method("get_held_fragment") and _lyra_node.get_held_fragment():
		_current_target_fragment = _lyra_node.get_held_fragment()
		_navigation_agent.target_position = _lyra_node.global_position
		return

	# Then, loose fragments in detection area
	var fragments_in_area: Array[Node3D] = []
	for body in _detection_area.get_overlapping_bodies():
		if body.is_in_group(_memory_fragment_group) and not body.get_meta("is_cleansed", false):
			fragments_in_area.append(body)

	if not fragments_in_area.is_empty():
		var nearest_fragment: PhysicsBody3D = _find_nearest_fragment(fragments_in_area)
		if nearest_fragment != _current_target_fragment:
			_set_target_fragment(nearest_fragment)
	elif _current_target_fragment and _current_target_fragment.get_meta("is_cleansed", false):
		_current_target_fragment = null # Clear target if it was cleansed by another archivist
	elif not _current_target_fragment:
		_navigation_agent.target_position = global_position # Stay put if no target

func _find_nearest_fragment(fragments: Array[Node3D]) -> PhysicsBody3D:
	var nearest: PhysicsBody3D = null
	var min_dist_sq: float = INF
	for fragment in fragments:
		var dist_sq: float = global_position.distance_squared_to(fragment.global_position)
		if dist_sq < min_dist_sq:
			min_dist_sq = dist_sq
			nearest = fragment as PhysicsBody3D
	return nearest

func _set_target_fragment(fragment: PhysicsBody3D) -> void:
	_current_target_fragment = fragment
	_navigation_agent.target_position = fragment.global_position

func _handle_movement(delta: float) -> void:
	if not _navigation_agent.is_navigation_finished():
		var next_point: Vector3 = _navigation_agent.get_next_path_position()
		var direction: Vector3 = (next_point - global_position).normalized()
		_navigation_agent.set_velocity(direction * _movement_speed)
	else:
		_navigation_agent.set_velocity(Vector3.ZERO)

func _on_velocity_computed(safe_velocity: Vector3) -> void:
	velocity = safe_velocity
	move_and_slide()

func _handle_cleansing(delta: float) -> void:
	if not _current_target_fragment:
		return

	var target_pos: Vector3 = _current_target_fragment.global_position
	if _current_target_fragment == _lyra_node?.get_held_fragment():
		target_pos = _lyra_node.global_position # Target Lyra's position if she holds it

	if global_position.distance_to(target_pos) <= _reclamation_range:
		if not _is_cleansing:
			_start_cleansing()
		_cleansing_timer += delta
		if _cleansing_timer >= _cleansing_duration:
			_finish_cleansing()
	elif _is_cleansing:
		_stop_cleansing()

func _start_cleansing() -> void:
	_is_cleansing = true
	_cleansing_timer = 0.0
	# Visual feedback for Archivist (e.g., glowing) could be added here

func _stop_cleansing() -> void:
	_is_cleansing = false
	_cleansing_timer = 0.0
	# Reset Archivist visual feedback

func _finish_cleansing() -> void:
	if not _current_target_fragment:
		return

	if _current_target_fragment == _lyra_node?.get_held_fragment():
		_attempt_reclaim_from_lyra(_lyra_node, _current_target_fragment)
	else:
		_apply_cleansed_effect(_current_target_fragment)

	_current_target_fragment.set_meta("is_cleansed", true)
	_current_target_fragment = null
	_is_cleansing = false
	_cleansing_timer = 0.0

func _apply_cleansed_effect(fragment: PhysicsBody3D) -> void:
	if fragment is MeshInstance3D and _cleansed_material:
		(fragment as MeshInstance3D).material_override = _cleansed_material
	# Optionally, disable collision or make it non-interactable for Lyra
	# PhysicsServer3D.body_set_collision_layer(fragment.get_rid(), 0)
	# PhysicsServer3D.body_set_collision_mask(fragment.get_rid(), 0)

func _attempt_reclaim_from_lyra(lyra: CharacterBody3D, fragment: PhysicsBody3D) -> void:
	if lyra and lyra.has_method("release_held_fragment"):
		lyra.release_held_fragment(fragment)
		_apply_cleansed_effect(fragment)

func _on_detection_area_body_entered(body: PhysicsBody3D) -> void:
	if body.is_in_group(_memory_fragment_group) and not body.get_meta("is_cleansed", false):
		if not _current_target_fragment:
			_set_target_fragment(body)
	elif body.name == "Lyra": # Assuming Lyra's node name is "Lyra"
		_lyra_node = body as CharacterBody3D

func _on_detection_area_body_exited(body: PhysicsBody3D) -> void:
	if body == _current_target_fragment:
		_current_target_fragment = null
		_stop_cleansing()
	elif body == _lyra_node:
		_lyra_node = null
