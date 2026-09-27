@tool
extends CharacterBody3D

# --- Parameters ---
@export_group("Disorientation Settings")
@export_range(1.0, 10.0, 0.1) var disorientation_duration: float = 3.0:
	set(value):
		disorientation_duration = value
		if _disorientation_timer:
			_disorientation_timer.wait_time = disorientation_duration
@export_range(0.1, 1.0, 0.05) var hud_drift_intensity: float = 0.5
@export var affected_input_actions: Array[String] = ["move_forward", "move_backward", "strafe_left", "strafe_right", "jump", "attack"]
@export var affected_hud_paths: Array[NodePath] = [] # Paths to Control nodes in the player's HUD

# --- Internal State ---
var _is_disorienting: bool = false
var _disorientation_timer: Timer
var _original_input_events: Dictionary = {} # Stores original events for affected actions
var _original_hud_states: Dictionary = {} # Stores original properties for affected HUD nodes
var _disoriented_hud_nodes: Array[Control] = []
var _target_player: Node = null # The player currently being disoriented

# --- Godot Lifecycle ---
func _ready() -> void:
	_setup_disorientation_timer()

func _process(delta: float) -> void:
	if _is_disorienting and _target_player:
		_update_hud_disorientation(delta)

# --- Public API (Stalker's attack logic would call this) ---
func apply_disorientation(player_node: Node) -> void:
	if _is_disorienting:
		return # Already disorienting a player

	_target_player = player_node
	_is_disorienting = true
	_disorientation_timer.start()

	_store_and_scramble_input()
	_store_and_disorient_hud()
	print("Player disoriented!")

# --- Disorientation Logic ---
func _setup_disorientation_timer() -> void:
	_disorientation_timer = Timer.new()
	add_child(_disorientation_timer)
	_disorientation_timer.wait_time = disorientation_duration
	_disorientation_timer.one_shot = true
	_disorientation_timer.timeout.connect(_end_disorientation)

func _store_and_scramble_input() -> void:
	_original_input_events.clear()
	var current_events: Dictionary = {}

	# Store current events for affected actions
	for action_name in affected_input_actions:
		if InputMap.has_action(action_name):
			var events = InputMap.action_get_events(action_name)
			_original_input_events[action_name] = events.duplicate()
			current_events[action_name] = events.duplicate()
		else:
			push_warning("Input action '%s' not found." % action_name)

	# Scramble events
	var event_pool: Array[InputEvent] = []
	for action_name in current_events:
		event_pool.append_array(current_events[action_name])

	event_pool.shuffle() # Randomize the order of all collected events

	var event_index = 0
	for action_name in affected_input_actions:
		if InputMap.has_action(action_name):
			# Clear existing events for this action
			for event in InputMap.action_get_events(action_name):
				InputMap.action_erase_event(action_name, event)

			# Add scrambled events
			var num_events_to_assign = min(event_pool.size() - event_index, _original_input_events[action_name].size() if _original_input_events.has(action_name) else 1)
			for i in range(num_events_to_assign):
				if event_index < event_pool.size():
					InputMap.action_add_event(action_name, event_pool[event_index])
					event_index += 1

func _store_and_disorient_hud() -> void:
	_original_hud_states.clear()
	_disoriented_hud_nodes.clear()

	var viewport_size = get_viewport_rect().size

	for path in affected_hud_paths:
		var hud_node = _target_player.get_node_or_null(path)
		if hud_node and hud_node is Control:
			_original_hud_states[hud_node] = {
				"position": hud_node.position,
				"rotation": hud_node.rotation,
				"scale": hud_node.scale,
				"alpha": hud_node.modulate.a,
				"parent": hud_node.get_parent()
			}
			_disoriented_hud_nodes.append(hud_node)

			# Re-parent to a temporary CanvasLayer for floating effect
			var temp_canvas_layer = CanvasLayer.new()
			temp_canvas_layer.name = "TempDisorientationCanvasLayer_%s" % hud_node.name # Unique name
			_target_player.add_child(temp_canvas_layer)
			hud_node.reparent(temp_canvas_layer)

			# Apply initial random properties
			hud_node.position = Vector2(randf_range(0, viewport_size.x), randf_range(0, viewport_size.y))
			hud_node.rotation = randf_range(-PI, PI)
			hud_node.scale = Vector2(randf_range(0.5, 1.5), randf_range(0.5, 1.5))
			hud_node.modulate.a = randf_range(0.3, 0.8)
		else:
			push_warning("HUD node at path '%s' not found or not a Control node." % path)

func _update_hud_disorientation(delta: float) -> void:
	var viewport_size = get_viewport_rect().size
	for hud_node in _disoriented_hud_nodes:
		if is_instance_valid(hud_node):
			# Drift randomly
			hud_node.position += Vector2(randf_range(-1, 1), randf_range(-1, 1)) * hud_drift_intensity * 100 * delta
			hud_node.position.x = wrapf(hud_node.position.x, 0, viewport_size.x)
			hud_node.position.y = wrapf(hud_node.position.y, 0, viewport_size.y)

			# Slight rotation change
			hud_node.rotation += randf_range(-1, 1) * hud_drift_intensity * delta
			hud_node.rotation = wrapf(hud_node.rotation, -PI, PI)

			# Alpha flicker
			hud_node.modulate.a = lerp(hud_node.modulate.a, randf_range(0.3, 0.8), hud_drift_intensity * delta * 5)

func _end_disorientation() -> void:
	_restore_input()
	_restore_hud()

	_is_disorienting = false
	_target_player = null
	print("Player disorientation ended.")

func _restore_input() -> void:
	for action_name in _original_input_events:
		if InputMap.has_action(action_name):
			# Clear current events for this action
			for event in InputMap.action_get_events(action_name):
				InputMap.action_erase_event(action_name, event)
			# Add original events back
			for event in _original_input_events[action_name]:
				InputMap.action_add_event(action_name, event)

func _restore_hud() -> void:
	for hud_node in _disoriented_hud_nodes:
		if is_instance_valid(hud_node) and _original_hud_states.has(hud_node):
			var original_state = _original_hud_states[hud_node]
			hud_node.position = original_state["position"]
			hud_node.rotation = original_state["rotation"]
			hud_node.scale = original_state["scale"]
			hud_node.modulate.a = original_state["alpha"]

			var original_parent = original_state["parent"]
			if is_instance_valid(original_parent):
				hud_node.reparent(original_parent)
			else:
				push_warning("Original parent for HUD node '%s' is invalid. Cannot re-parent." % hud_node.name)
				hud_node.queue_free() # Fallback: remove if no clear parent

			# Clean up the temporary CanvasLayer
			var temp_canvas_layer = hud_node.get_parent()
			if temp_canvas_layer and temp_canvas_layer.name.begins_with("TempDisorientationCanvasLayer_"):
				temp_canvas_layer.queue_free()

	_original_hud_states.clear()
	_disoriented_hud_nodes.clear()
