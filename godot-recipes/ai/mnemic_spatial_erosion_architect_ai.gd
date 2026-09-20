extends Node3D

@export var lyra_node_path: NodePath
@export var erosion_range: float = 20.0 # Distance from Lyra to consider fragments
@export var erosion_interval: float = 0.5 # How often the Architect acts
@export var reconfiguration_chance: float = 0.3 # Chance to reconfigure instead of erode

var _lyra: CharacterBody3D
var _timer: float = 0.0
var _erodible_fragments: Array[Node3D] = [] # All fragments in the scene

const EROSION_GROUP_NAME = "ErodibleFragment" # Group for all manipulable memory fragments

func _ready() -> void:
	if lyra_node_path:
		_lyra = get_node_or_null(lyra_node_path)
		if not _lyra:
			push_error("Architect: Lyra node not found at path: %s" % lyra_node_path)
	else:
		push_error("Architect: Lyra node path not set.")

	_erodible_fragments = get_tree().get_nodes_in_group(EROSION_GROUP_NAME)
	if _erodible_fragments.is_empty():
		push_warning("Architect: No nodes in group '%s'. Erosion will not occur." % EROSION_GROUP_NAME)

func _process(delta: float) -> void:
	if not _lyra:
		return

	_timer += delta
	if _timer >= erosion_interval:
		_timer = 0.0
		_execute_erosion_cycle()

func _execute_erosion_cycle() -> void:
	var lyra_pos = _lyra.global_position
	var fragments_in_range: Array[Node3D] = []

	for fragment in _erodible_fragments:
		if fragment and fragment.is_inside_tree() and lyra_pos.distance_to(fragment.global_position) < erosion_range:
			fragments_in_range.append(fragment)

	if fragments_in_range.is_empty():
		return

	# Affect one fragment per cycle for gradual changes
	# A simple random selection from fragments in range for line count constraint
	var fragment_to_affect = fragments_in_range[randi() % fragments_in_range.size()]

	if randf() < reconfiguration_chance:
		_reconfigure_fragment(fragment_to_affect)
	else:
		_erode_fragment(fragment_to_affect)

func _erode_fragment(fragment: Node3D) -> void:
	var static_body = fragment.find_child("StaticBody3D") as StaticBody3D
	var nav_region = fragment.find_child("NavigationRegion3D") as NavigationRegion3D
	var mesh_instance = fragment.find_child("MeshInstance3D") as MeshInstance3D

	if static_body:
		for i in range(static_body.get_shape_count()):
			PhysicsServer3D.body_set_shape_disabled(static_body.get_rid(), i, true)
	if mesh_instance:
		mesh_instance.visible = false # Visual cue for erosion

	if nav_region:
		# Clear the navigation mesh for this region, making it untraversable
		NavigationServer3D.region_set_navigation_mesh(nav_region.get_rid(), NavigationMesh.new())
		NavigationServer3D.map_force_update(nav_region.get_navigation_map()) # Apply changes

	print("Architect: Eroded fragment: %s" % fragment.name)

func _reconfigure_fragment(fragment: Node3D) -> void:
	# Simple reconfiguration: move and rotate slightly
	fragment.global_position += Vector3(randf() * 2 - 1, randf() * 0.5, randf() * 2 - 1) * 0.5
	fragment.rotation_degrees.y += randf() * 60 - 30 # Rotate around Y axis

	# If the fragment has multiple collision shapes, activate a different one
	var static_body = fragment.find_child("StaticBody3D") as StaticBody3D
	if static_body and static_body.get_shape_count() > 1:
		var active_shape_idx = randi() % static_body.get_shape_count()
		for i in range(static_body.get_shape_count()):
			PhysicsServer3D.body_set_shape_disabled(static_body.get_rid(), i, (i != active_shape_idx))
		print("Architect: Reconfigured fragment %s, activated shape %d" % [fragment.name, active_shape_idx])
	else:
		print("Architect: Reconfigured fragment: %s (position/rotation only)" % fragment.name)

	var nav_region = fragment.find_child("NavigationRegion3D") as NavigationRegion3D
	if nav_region:
		# If geometry changes, its NavigationMesh needs to be updated.
		# For simple transforms or shape swaps, a map force update is often sufficient.
		NavigationServer3D.map_force_update(nav_region.get_navigation_map())