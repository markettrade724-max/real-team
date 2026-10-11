extends Node3D

signal memory_lost(memory_category: String, erosion_target_node: CSGCombiner3D)

var _erosion_rules: Dictionary = {}
var _registered_targets: Dictionary = {}

func _ready() -> void:
	_initialize_erosion_rules()
	_connect_signals()

func _initialize_erosion_rules() -> void:
	# Defines how geometry changes for a given memory category.
	# 'polygon_shape' are points for a 2D polygon (XZ plane).
	# 'height' is the extrusion depth along Y.
	_erosion_rules = {
		"trust": {
			"modification_type": "subtract",
			"polygon_shape": [Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)],
			"height": 2.0
		},
		"home": {
			"modification_type": "add",
			"polygon_shape": [Vector3(0, 0, 0), Vector3(0.5, 0, 0.5), Vector3(0, 0, 1), Vector3(-0.5, 0, 0.5)],
			"height": 1.0
		},
		"purpose": {
			"modification_type": "intersect",
			"polygon_shape": [Vector3(-0.5, 0, -0.5), Vector3(0.5, 0, -0.5), Vector3(0.5, 0, 0.5), Vector3(-0.5, 0, 0.5)],
			"height": 3.0
		}
	}

func _connect_signals() -> void:
	# Connect to a global MemoryManager or Lyra's state in a full game.
	# For this recipe, we connect to ourselves for demonstration.
	memory_lost.connect(_on_memory_lost)

func register_erosion_target(category: String, csg_combiner_node: CSGCombiner3D) -> void:
	# Registers a CSGCombiner3D node to be affected by a specific memory category.
	if not _registered_targets.has(category):
		_registered_targets[category] = []
	_registered_targets[category].append(csg_combiner_node)

func _on_memory_lost(memory_category: String, erosion_target_node: CSGCombiner3D) -> void:
	# Triggered when a memory is lost, initiating structural erosion.
	if not _erosion_rules.has(memory_category):
		return

	var rule = _erosion_rules[memory_category]
	var targets_for_category = _registered_targets.get(memory_category, [])

	var nodes_to_erode: Array[CSGCombiner3D] = []
	if erosion_target_node:
		# If a specific node is provided, ensure it's registered for this category.
		if targets_for_category.has(erosion_target_node):
			nodes_to_erode.append(erosion_target_node)
		else:
			push_warning("Provided erosion_target_node is not registered for category: %s" % memory_category)
			return
	elif not targets_for_category.is_empty():
		# If no specific node, erode all registered targets for this category.
		nodes_to_erode = targets_for_category

	for csg_combiner in nodes_to_erode:
		_apply_erosion_to_csg(csg_combiner, rule)
		_update_navigation_mesh(csg_combiner)

func _apply_erosion_to_csg(csg_combiner: CSGCombiner3D, rule: Dictionary) -> void:
	# Performs CSG operations on the target CSGCombiner3D.
	if not csg_combiner is CSGCombiner3D:
		push_error("Erosion target node must be a CSGCombiner3D for dynamic operations.")
		return

	var new_polygon_points = rule["polygon_shape"]
	var height = rule["height"]
	var modification_type = rule["modification_type"]

	var erosion_shape = CSGPolygon3D.new()
	erosion_shape.polygon = PackedVector2Array([Vector2(p.x, p.z) for p in new_polygon_points])
	erosion_shape.depth = height
	erosion_shape.position = Vector3(0, 0, 0) # Relative to the combiner's origin
	erosion_shape.material = csg_combiner.material # Inherit material
	erosion_shape.name = "ErosionShape_%s_%s" % [modification_type, Time.get_ticks_msec()]

	match modification_type:
		"subtract":
			erosion_shape.operation = CSGPolygon3D.OPERATION_SUBTRACTION
		"add":
			erosion_shape.operation = CSGPolygon3D.OPERATION_UNION
		"intersect":
			erosion_shape.operation = CSGPolygon3D.OPERATION_INTERSECTION
		_:
			push_warning("Unknown CSG operation type: %s" % modification_type)
			erosion_shape.queue_free()
			return

	csg_combiner.add_child(erosion_shape)
	# Set owner for proper scene saving if the combiner is part of a saved scene
	if get_tree().edited_scene_root:
		erosion_shape.owner = get_tree().edited_scene_root

func _update_navigation_mesh(affected_node: Node3D) -> void:
	# Triggers a navigation mesh bake for the region containing the affected node.
	var nav_region: NavigationRegion3D = null
	# Attempt to find an associated NavigationRegion3D by traversing up the tree.
	var current_node = affected_node
	while current_node:
		if current_node is NavigationRegion3D:
			nav_region = current_node
			break
		current_node = current_node.get_parent()

	if not nav_region:
		# Fallback: search for any NavigationRegion3D in the scene if not found locally.
		# (Requires NavigationRegion3D nodes to be in a group named "navigation_regions")
		nav_region = get_tree().get_first_node_in_group("navigation_regions") as NavigationRegion3D
		if not nav_region:
			push_warning("No NavigationRegion3D found to update after erosion.")
			return

	var region_rid = nav_region.get_rid()
	if region_rid.is_valid():
		# Clearing and re-baking the navigation mesh for the region.
		# This is an asynchronous operation.
		NavigationServer3D.region_set_navigation_mesh(region_rid, null) # Clear existing mesh
		NavigationServer3D.region_bake_navigation_mesh(region_rid, nav_region.navigation_mesh)

# Helper function to manually trigger erosion for testing or specific events.
func trigger_erosion_event(category: String, target_node: CSGCombiner3D = null) -> void:
	memory_lost.emit(category, target_node)
