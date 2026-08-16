@tool
extends Node3D

# --- Exported Parameters ---
@export_range(0.05, 2.0, 0.01) var flicker_interval: float = 0.2:
	set(value):
		flicker_interval = value
		if is_node_ready() and _flicker_timer:
			_flicker_timer.wait_time = flicker_interval

@export var temporal_state_nodes: Array[Node3D] = []: # Nodes representing different temporal states (e.g., intact, decayed)
	set(value):
		temporal_state_nodes = value
		if is_node_ready():
			_initialize_temporal_states() # Re-initialize if nodes change in editor

@export var blend_display_mesh: MeshInstance3D: # The MeshInstance3D that displays the blended output
	set(value):
		blend_display_mesh = value
		if is_node_ready():
			_setup_components() # Re-setup if mesh changes

@export var collision_shapes: Array[CollisionShape3D] = []: # CollisionShape3D nodes for each state
	set(value):
		collision_shapes = value
		if is_node_ready():
			_initialize_collision_rids() # Re-initialize if shapes change

# --- Internal Variables ---
var _flicker_timer: Timer
var _current_state_index: int = 0 # 0 for intact, 1 for decayed
var _blend_factor: float = 0.0 # 0.0 for intact, 1.0 for decayed
var _shader_material: ShaderMaterial
var _body_rids: Array[RID] = []
var _shape_indices: Array[int] = []

func _ready() -> void:
	_setup_components()
	_initialize_temporal_states()
	_initialize_collision_rids()
	_start_flicker_timer()
	_update_collision_state(_current_state_index) # Set initial state

func _process(delta: float) -> void:
	# Update shader uniform for visual blending
	if _shader_material:
		_shader_material.set_shader_parameter("blend_factor", _blend_factor)

func _setup_components() -> void:
	# Ensure blend_display_mesh exists and has a ShaderMaterial
	if not blend_display_mesh or not blend_display_mesh.mesh:
		push_error("Blend display mesh or its mesh is not set.")
		set_process(false)
		return

	_shader_material = blend_display_mesh.get_active_material(0) as ShaderMaterial
	if not _shader_material:
		push_error("Blend display mesh does not have a ShaderMaterial. Please assign a ShaderMaterial with 'mnemonic_temporal_flicker.gdshader'.")
		set_process(false)
		return

	# Create and configure flicker timer if it doesn't exist
	if not _flicker_timer:
		_flicker_timer = Timer.new()
		add_child(_flicker_timer)
		_flicker_timer.timeout.connect(_on_flicker_timer_timeout)
	
	_flicker_timer.wait_time = flicker_interval
	_flicker_timer.autostart = false
	_flicker_timer.one_shot = false

func _initialize_temporal_states() -> void:
	# Clean up existing SubViewports and their children (temporal_state_nodes)
	for child in get_children():
		if child is SubViewport and child.name.begins_with("TemporalSubViewport_"):
			# Move temporal_state_nodes back to parent before queue_free if needed
			for grand_child in child.get_children():
				if grand_child in temporal_state_nodes:
					child.remove_child(grand_child)
					add_child(grand_child) # Move back to this node temporarily
			child.queue_free()

	if temporal_state_nodes.size() < 2:
		push_error("At least two temporal state nodes are required for 'The Shimmering Echoes of What Was'.")
		set_process(false)
		return

	if not blend_display_mesh:
		push_error("Blend display mesh is not set.")
		set_process(false)
		return
	blend_display_mesh.visible = true

	# Create SubViewports and assign textures
	for i in range(temporal_state_nodes.size()):
		var state_node = temporal_state_nodes[i]
		if not state_node:
			push_warning("Temporal state node at index %d is null. Skipping." % i)
			continue

		var sub_viewport = SubViewport.new()
		sub_viewport.name = "TemporalSubViewport_" + str(i)
		sub_viewport.size = get_viewport().size # Match main viewport size
		sub_viewport.transparent_bg = true
		sub_viewport.usage = SubViewport.USAGE_3D
		add_child(sub_viewport)

		# Move the state_node into the SubViewport
		if state_node.get_parent() != sub_viewport: # Only move if not already correctly parented
			if state_node.get_parent():
				state_node.get_parent().remove_child(state_node)
			sub_viewport.add_child(state_node)

		# Assign SubViewportTexture to shader parameter
		var texture_param_name = ""
		if i == 0:
			texture_param_name = "intact_texture"
		elif i == 1:
			texture_param_name = "decayed_texture"
		else:
			push_warning("Shader only supports 2 temporal states (intact_texture, decayed_texture). State %d will not be rendered." % i)
			continue # Skip assigning for more than 2 states with this simple shader

		if _shader_material:
			_shader_material.set_shader_parameter(texture_param_name, sub_viewport.get_texture())

func _initialize_collision_rids() -> void:
	_body_rids.clear()
	_shape_indices.clear()

	if collision_shapes.size() != temporal_state_nodes.size():
		push_warning("Number of collision shapes (%d) does not match number of temporal states (%d). Physics might be incorrect." % [collision_shapes.size(), temporal_state_nodes.size()])

	for i in range(collision_shapes.size()):
		var shape_node = collision_shapes[i]
		if not shape_node:
			push_warning("CollisionShape3D at index %d is null. Skipping." % i)
			_body_rids.append(RID()) # Append invalid RID
			_shape_indices.append(-1)
			continue

		var parent_body = shape_node.get_parent() as PhysicsBody3D
		if not parent_body:
			push_warning("CollisionShape3D '%s' at index %d has no PhysicsBody3D parent. Skipping." % [shape_node.name, i])
			_body_rids.append(RID())
			_shape_indices.append(-1)
			continue

		var body_rid = parent_body.get_rid()
		var shape_idx = parent_body.shape_find_owner(shape_node.get_rid())

		if not body_rid.is_valid() or shape_idx == -1:
			push_warning("Could not get valid RID or shape index for CollisionShape3D '%s' at index %d. Skipping." % [shape_node.name, i])
			_body_rids.append(RID())
			_shape_indices.append(-1)
			continue

		_body_rids.append(body_rid)
		_shape_indices.append(shape_idx)

func _start_flicker_timer() -> void:
	if _flicker_timer:
		_flicker_timer.start()

func _on_flicker_timer_timeout() -> void:
	if temporal_state_nodes.size() < 2: return

	# Toggle between state 0 (intact) and state 1 (decayed)
	_current_state_index = 1 - _current_state_index
	_blend_factor = float(_current_state_index) # Visual matches collision state
	_update_collision_state(_current_state_index)

func _update_collision_state(active_index: int) -> void:
	if _body_rids.is_empty():
		return

	for i in range(_body_rids.size()):
		var body_rid = _body_rids[i]
		var shape_idx = _shape_indices[i]

		if body_rid.is_valid() and shape_idx != -1:
			var is_active = (i == active_index)
			PhysicsServer3D.body_set_shape_disabled(body_rid, shape_idx, not is_active)
