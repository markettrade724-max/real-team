extends Node

class_name MemoryScaffoldWeave

# Stores active scaffolds: {body_rid: {timer: Timer, shape_rid: RID, visual_node: Node3D}}
var _active_scaffolds: Dictionary = {}

# Parameters for scaffold creation
var _scaffold_duration: float = 5.0
var _scaffold_size: Vector3 = Vector3(2.0, 0.2, 2.0) # Default size for a bridge-like platform

func _init(duration: float = 5.0, size: Vector3 = Vector3(2.0, 0.2, 2.0)):
	_scaffold_duration = duration
	_scaffold_size = size

# Creates a temporary physical scaffold at the given transform.
# Returns the RID of the created StaticBody3D if successful, otherwise null.
func activate_scaffold(spawn_transform: Transform3D, visual_scene: PackedScene = null) -> RID:
	# 1. Create a new StaticBody3D RID
	var body_rid: RID = PhysicsServer3D.body_create(PhysicsServer3D.BODY_MODE_STATIC)
	PhysicsServer3D.body_set_space(body_rid, get_world_3d().space)
	PhysicsServer3D.body_set_state(body_rid, PhysicsServer3D.BODY_STATE_TRANSFORM, spawn_transform)

	# 2. Create a BoxShape3D RID for the scaffold
	var shape_rid: RID = PhysicsServer3D.shape_create(PhysicsServer3D.SHAPE_BOX)
	PhysicsServer3D.shape_set_data(shape_rid, _scaffold_size)

	# 3. Add the shape to the body
	PhysicsServer3D.body_add_shape(body_rid, shape_rid)
	PhysicsServer3D.body_set_shape_transform(body_rid, 0, Transform3D()) # Shape transform relative to body

	# 4. Create visual representation if a PackedScene is provided
	var visual_node: Node3D = null
	if visual_scene:
		visual_node = visual_scene.instantiate() as Node3D
		if visual_node:
			add_child(visual_node)
			visual_node.global_transform = spawn_transform
			# Scale visual node to match scaffold_size if it's a simple mesh
			if visual_node is MeshInstance3D:
				var mesh_aabb = visual_node.mesh.get_aabb()
				var current_size = mesh_aabb.size
				if current_size.x > 0 and current_size.y > 0 and current_size.z > 0:
					visual_node.scale = _scaffold_size / current_size

	# 5. Set up a timer for despawning
	var despawn_timer: Timer = Timer.new()
	add_child(despawn_timer)
	despawn_timer.wait_time = _scaffold_duration
	despawn_timer.one_shot = true
	despawn_timer.timeout.connect(Callable(self, "_on_scaffold_timeout").bind(body_rid))
	despawn_timer.start()

	_active_scaffolds[body_rid] = {"timer": despawn_timer, "shape_rid": shape_rid, "visual_node": visual_node}

	return body_rid

# Callback for when a scaffold's despawn timer times out.
func _on_scaffold_timeout(body_rid: RID):
	if _active_scaffolds.has(body_rid):
		var scaffold_data: Dictionary = _active_scaffolds[body_rid]
		var shape_rid: RID = scaffold_data["shape_rid"]
		var timer: Timer = scaffold_data["timer"]
		var visual_node: Node3D = scaffold_data["visual_node"]

		# 1. Remove the shape from the body
		PhysicsServer3D.body_remove_shape(body_rid, 0)
		# 2. Free the shape RID
		PhysicsServer3D.free_rid(shape_rid)
		# 3. Free the body RID
		PhysicsServer3D.free_rid(body_rid)

		# 4. Remove the timer node
		timer.queue_free()

		# 5. Remove the visual node if it exists
		if visual_node:
			visual_node.queue_free()

		# 6. Remove from active scaffolds dictionary
		_active_scaffolds.erase(body_rid)

# Cleans up all active scaffolds when the node is freed.
func _exit_tree():
	for body_rid in _active_scaffolds.keys():
		var scaffold_data: Dictionary = _active_scaffolds[body_rid]
		var shape_rid: RID = scaffold_data["shape_rid"]
		var timer: Timer = scaffold_data["timer"]
		var visual_node: Node3D = scaffold_data["visual_node"]

		PhysicsServer3D.body_remove_shape(body_rid, 0)
		PhysicsServer3D.free_rid(shape_rid)
		PhysicsServer3D.free_rid(body_rid)
		timer.queue_free() # Ensure timer is freed
		if visual_node:
			visual_node.queue_free()

	_active_scaffolds.clear()
