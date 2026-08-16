extends Node3D

# Signal emitted when a memory is lost, carrying the memory ID.
signal memory_lost(memory_id: String)

# Dictionary to map memory IDs to arrays of affected Node3D references.
# Storing Node3D references directly allows easier manipulation.
var _memory_to_world_elements: Dictionary = {}

func _ready() -> void:
	# Connect the internal handler to the memory_lost signal.
	memory_lost.connect(_on_memory_lost)

# Registers a Node3D to be affected when a specific memory is lost.
# 'element' should be a MeshInstance3D for visual effects or a StaticBody3D/RigidBody3D for physics.
func register_memory_linked_element(memory_id: String, element: Node3D) -> void:
	if not _memory_to_world_elements.has(memory_id):
		_memory_to_world_elements[memory_id] = []
	_memory_to_world_elements[memory_id].append(element)

# Call this function from your game logic when Lyra loses a memory.
func lyra_loses_memory(memory_id: String) -> void:
	memory_lost.emit(memory_id)

# Internal handler for the memory_lost signal. Triggers environmental changes.
func _on_memory_lost(memory_id: String) -> void:
	if _memory_to_world_elements.has(memory_id):
		for element in _memory_to_world_elements[memory_id]:
			if is_instance_valid(element):
				_apply_echo_quake_effect(element)
		# Once memory is lost and effects applied, remove its linked elements from tracking.
		_memory_to_world_elements.erase(memory_id)

# Applies the visual and physical decay to a specific world element.
func _apply_echo_quake_effect(element: Node3D) -> void:
	# Visual degradation: Trigger shader dissolution.
	if element is MeshInstance3D:
		var mesh_instance = element as MeshInstance3D
		if mesh_instance.mesh:
			var material = mesh_instance.get_active_material(0)
			if material is ShaderMaterial:
				# Start a Tween to animate the dissolve_amount from 0.0 to 1.0.
				var tween = create_tween()
				tween.set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_QUAD)
				tween.tween_property(material, "shader_parameter/dissolve_amount", 1.0, 1.5) # 1.5s dissolve animation.
				tween.tween_callback(Callable(element, "queue_free")) # Free after dissolve completes.

	# Physical changes: Modify collision and physics properties.
	if element is StaticBody3D or element is RigidBody3D:
		var body_rid = element.get_rid()
		# Disable collision for the body immediately.
		PhysicsServer3D.body_set_collision_layer(body_rid, 0)
		PhysicsServer3D.body_set_collision_mask(body_rid, 0)

		# If it's a StaticBody3D, make it a RigidBody3D and apply gravity/impulse to make it fall.
		if element is StaticBody3D:
			PhysicsServer3D.body_set_mode(body_rid, PhysicsServer3D.BODY_MODE_RIGID)
			PhysicsServer3D.body_set_gravity_scale(body_rid, 1.0)
			# Apply a slight downward impulse to initiate movement.
			PhysicsServer3D.body_apply_central_impulse(body_rid, Vector3.DOWN * 2.0)
		# If it's a RigidBody3D, it will already be affected by physics.
		# For elements without a MeshInstance3D child, queue_free directly if no visual dissolve.
		if not (element is MeshInstance3D): # If it's a StaticBody3D without a direct mesh child.
			element.queue_free() # Free immediately if no visual dissolve is expected.
