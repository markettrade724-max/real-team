	@tool
	extends Node

	class_name SynapticFeedbackEraserManager

	@export var actions_to_scramble: Array[String] = ["move_left", "move_right", "jump", "attack"]
	@export var available_keys_for_scramble: Array[Key] = [
		KEY_Q, KEY_E, KEY_R, KEY_T, KEY_Y, KEY_U, KEY_I, KEY_O, KEY_P,
		KEY_F, KEY_G, KEY_H, KEY_J, KEY_K, KEY_L,
		KEY_Z, KEY_X, KEY_C, KEY_V, KEY_B, KEY_N, KEY_M
	]
	@export var ui_distortion_overlay_path: NodePath # Path to a ColorRect node for UI overlay
	@export var ui_distortion_shader: Shader # Shader resource for UI distortion

	var _original_input_mappings: Dictionary = {}
	var _active_ui_nodes: Array[Control] = []
	var _erosion_timer: Timer
	var _ui_overlay: ColorRect

	func _ready() -> void:
		# Store original mappings for actions_to_scramble
		for action_name in actions_to_scramble:
			_original_input_mappings[action_name] = InputMap.action_get_events(action_name)
	
		_erosion_timer = Timer.new()
		add_child(_erosion_timer)
		_erosion_timer.timeout.connect(_revert_erosion)

		if ui_distortion_overlay_path and get_node_or_null(ui_distortion_overlay_path):
			_ui_overlay = get_node(ui_distortion_overlay_path)
			_ui_overlay.visible = false
			if ui_distortion_shader:
				var material = ShaderMaterial.new()
				material.shader = ui_distortion_shader
				_ui_overlay.material = material
			else:
				push_warning("UI Distortion Overlay path is set, but no shader resource provided.")
		else:
			push_warning("UI Distortion Overlay path is not set or node not found.")

	func apply_erosion(duration: float, ui_nodes_to_hide: Array[Control] = []) -> void:
		if _erosion_timer.time_left > 0: # Already eroding, extend duration
			_erosion_timer.stop()
	
		_scramble_inputs()
		_distort_ui(ui_nodes_to_hide, true)
		
		_erosion_timer.start(duration)
		print("Synaptic Feedback Erosion applied for %s seconds." % duration)

	func _scramble_inputs() -> void:
		var used_scramble_keys: Array[Key] = []
		for action_name in actions_to_scramble:
			_remap_action(action_name, used_scramble_keys)

	func _remap_action(action_name: String, used_keys: Array[Key]) -> void:
		if not InputMap.has_action(action_name):
			push_warning("Action '%s' not found in InputMap." % action_name)
			return

		InputMap.action_erase_events(action_name)
		
		var available_for_this_action = available_keys_for_scramble.filter(func(key): return not key in used_keys)
		if available_for_this_action.is_empty():
			push_warning("No unique keys left for scrambling action '%s'. Reusing keys." % action_name)
			available_for_this_action = available_keys_for_scramble # Fallback to reusing keys

		var random_key_index = randi() % available_for_this_action.size()
		var new_key = available_for_this_action[random_key_index]
		used_keys.append(new_key) # Mark as used for this erosion cycle

		var new_event = InputEventKey.new()
		new_event.keycode = new_key
		new_event.pressed = true # This event represents the key being pressed
		InputMap.action_add_event(action_name, new_event)
		print("Remapped action '%s' to key '%s'." % [action_name, OS.get_keycode_string(new_key)])

	func _distort_ui(ui_nodes: Array[Control], enable: bool) -> void:
		_active_ui_nodes = ui_nodes
		for node in _active_ui_nodes:
			if is_instance_valid(node):
				node.visible = not enable # Hide specified UI nodes
		
		if _ui_overlay:
			_ui_overlay.visible = enable
			if enable and _ui_overlay.material is ShaderMaterial:
				var material: ShaderMaterial = _ui_overlay.material
				material.set_shader_parameter("time", 0.0) # Reset time for shader animation
				material.set_shader_parameter("distortion_strength", 0.1 + randf() * 0.2) # Randomize strength
				material.set_shader_parameter("color_shift_strength", 0.05 + randf() * 0.1) # Randomize color shift

	func _revert_erosion() -> void:
		for action_name in actions_to_scramble:
			_restore_action(action_name)
		
		_distort_ui([], false) # Revert UI changes
		print("Synaptic Feedback Erosion reverted.")

	func _restore_action(action_name: String) -> void:
		if not InputMap.has_action(action_name):
			push_warning("Action '%s' not found in InputMap during restoration." % action_name)
			return

		InputMap.action_erase_events(action_name)
		if _original_input_mappings.has(action_name):
			for event in _original_input_mappings[action_name]:
				InputMap.action_add_event(action_name, event)
		else:
			push_warning("Original mapping for action '%s' not found." % action_name)

	func _process(delta: float) -> void:
		if _ui_overlay and _ui_overlay.visible and _ui_overlay.material is ShaderMaterial:
			var material: ShaderMaterial = _ui_overlay.material
			material.set_shader_parameter("time", material.get_shader_parameter("time") + delta)
