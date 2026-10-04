@tool
extends Node

signal memory_integrity_changed(new_integrity: float)
signal indecision_triggered()

@export_range(0.1, 5.0, 0.1) var action_timer_duration: float = 1.0:
	set(value):
		action_timer_duration = value
		if Engine.is_editor_hint():
			_reset_action_timers()

@export_range(0.01, 0.2, 0.01) var indecision_memory_loss: float = 0.05
@export_range(0.01, 1.0, 0.01) var shader_intensity_factor: float = 0.1
@export_range(0.1, 10.0, 0.1) var shader_decay_speed: float = 2.0
@export var shader_node_path: NodePath
@export var critical_actions: PackedStringArray = ["move_forward", "attack", "interact"]

var _memory_integrity: float = 1.0:
	set(value):
		_memory_integrity = clampf(value, 0.0, 1.0)
		memory_integrity_changed.emit(_memory_integrity)

var _current_shader_intensity: float = 0.0
var _shader_material: ShaderMaterial
var _action_last_pressed_time: Dictionary = {} # Stores Engine.get_process_uptime() for each action

func _ready() -> void:
	_initialize_state()

func _initialize_state() -> void:
	_memory_integrity = 1.0
	_current_shader_intensity = 0.0
	_setup_shader_material()
	_reset_action_timers()

func _setup_shader_material() -> void:
	if not shader_node_path.is_empty():
		var target_node: Node = get_node_or_null(shader_node_path)
		if target_node and target_node is CanvasItem:
			var canvas_item_node: CanvasItem = target_node as CanvasItem
			if canvas_item_node.material is ShaderMaterial:
				_shader_material = canvas_item_node.material as ShaderMaterial
				_shader_material.set_shader_parameter("intensity", 0.0)
			else:
				push_warning("Node at '%s' does not have a ShaderMaterial." % shader_node_path)
		else:
			push_warning("Node at '%s' is not a CanvasItem or does not exist." % shader_node_path)
	else:
		push_warning("Shader node path is not set.")

func _reset_action_timers() -> void:
	var current_time: float = Engine.get_process_uptime()
	for action_name in critical_actions:
		_action_last_pressed_time[action_name] = current_time

func _input(event: InputEvent) -> void:
	_handle_input_actions(event)

func _handle_input_actions(event: InputEvent) -> void:
	var current_time: float = Engine.get_process_uptime()
	for action_name in critical_actions:
		if event.is_action_pressed(action_name):
			_action_last_pressed_time[action_name] = current_time

func _process(delta: float) -> void:
	_update_shader_intensity(delta)
	_check_for_indecision()

func _update_shader_intensity(delta: float) -> void:
	_current_shader_intensity = max(0.0, _current_shader_intensity - shader_decay_speed * delta)
	if _shader_material:
		_shader_material.set_shader_parameter("intensity", _current_shader_intensity)

func _check_for_indecision() -> void:
	var current_time: float = Engine.get_process_uptime()
	for action_name in critical_actions:
		var last_pressed_time: float = _action_last_pressed_time.get(action_name, current_time)
		var time_since_last_press: float = current_time - last_pressed_time

		if time_since_last_press > action_timer_duration:
			_trigger_indecision(action_name, current_time)

func _trigger_indecision(action_name: String, current_time: float) -> void:
	_memory_integrity -= indecision_memory_loss
	_current_shader_intensity = min(1.0, _current_shader_intensity + shader_intensity_factor)
	indecision_triggered.emit()
	_action_last_pressed_time[action_name] = current_time
