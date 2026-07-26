@tool
extends Node3D

## Manages the visual and physical crumbling of the world based on Lyra's identity cohesion.
## The world literally breaks apart as Lyra's memories fade.

@export_range(0.0, 1.0, 0.01) var lyra_identity_cohesion: float = 1.0:
	set(value):
		lyra_identity_cohesion = clampf(value, 0.0, 1.0)
		_update_visual_distortion()
		_check_physical_crumble()

@export var crumble_thresholds: Array[float] = [0.7, 0.4, 0.1]: # Cohesion levels at which crumbling occurs
	set(value):
		crumble_thresholds = value.duplicate()
		crumble_thresholds.sort_custom(func(a, b): return a > b) # Sort descending
		_reset_crumble_states()

@export var affected_materials: Array[ShaderMaterial] # Materials to apply visual distortion
@export var crumble_zones_root: NodePath # Root node containing all CrumbleZone nodes

var _triggered_thresholds: Array[bool] = []
var _crumble_zones: Array[Node3D] = [] # References to Node3D acting as crumble zones
var _crumble_zone_states: Dictionary = {} # Tracks if a zone has crumbled

func _ready() -> void:
	if Engine.is_editor_hint():
		return
	_reset_crumble_states()
	_initialize_crumble_zones()
	_update_visual_distortion()
	_check_physical_crumble()

func _reset_crumble_states() -> void:
	_triggered_thresholds.clear()
	for _i in range(crumble_thresholds.size()):
		_triggered_thresholds.append(false)
	for zone in _crumble_zones:
		_crumble_zone_states[zone.get_path()] = false # Reset all zones to not crumbled

func _initialize_crumble_zones() -> void:
	_crumble_zones.clear()
	if not crumble_zones_root:
		return
	var root_node = get_node_or_null(crumble_zones_root)
	if root_node:
		for child in root_node.get_children():
			# Assume any direct child of crumble_zones_root is a potential crumble zone
			# A crumble zone should contain RigidBody3D children and optionally a GPUParticles3D
			_crumble_zones.append(child)
			_crumble_zone_states[child.get_path()] = false

func _update_visual_distortion() -> void:
	for material in affected_materials:
		if material and material.shader:
			material.set_shader_parameter("identity_cohesion", lyra_identity_cohesion)

func _check_physical_crumble() -> void:
	for i in range(crumble_thresholds.size()):
		if lyra_identity_cohesion <= crumble_thresholds[i] and not _triggered_thresholds[i]:
			_triggered_thresholds[i] = true
			_trigger_physical_crumble_for_threshold(crumble_thresholds[i])

func _trigger_physical_crumble_for_threshold(threshold: float) -> void:
	# Find an untriggered crumble zone to activate
	var untriggered_zones = _crumble_zones.filter(func(zone): return not _crumble_zone_states[zone.get_path()])
	if not untriggered_zones.is_empty():
		var zone_to_crumble = untriggered_zones.pick_random()
		_crumble_zone_states[zone_to_crumble.get_path()] = true
		_activate_crumble_zone(zone_to_crumble)
		printt("Crumbling zone:", zone_to_crumble.name, "at cohesion:", threshold)

func _activate_crumble_zone(zone: Node3D) -> void:
	# Find and activate particles within the zone
	for child in zone.get_children():
		if child is GPUParticles3D:
			child.emitting = true
		elif child is RigidBody3D:
			# Make RigidBody3D parts fall
			child.set_mode(RigidBody3D.MODE_RIGID)
			child.set_sleeping(false)
			# Optional: Apply a slight impulse to make them scatter
			child.apply_central_impulse(Vector3.UP * randf_range(0.5, 1.5) + Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)) * 0.5)
