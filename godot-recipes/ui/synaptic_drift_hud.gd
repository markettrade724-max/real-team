extends Control

@export_group("Drift Settings")
@export var drift_speed: float = 0.5 # How fast elements drift (seconds per cycle)
@export var max_drift_range: float = 50.0 # Max pixels elements can drift from origin
@export var snap_duration: float = 0.2 # How fast elements snap back
@export var snap_focus_cost: float = 10.0 # Resource cost to snap (example)

@export_group("HUD Elements")
@export var health_display: Control
@export var memory_display: Control
@export var objective_display: Control

var _element_data: Dictionary = {} # Stores {element: {initial_pos: Vector2, current_tween: Tween}}
var _global_drift_intensity: float = 0.0 # 0.0 (clear) to 1.0 (max drift)

func _ready() -> void:
	_initialize_element(health_display)
	_initialize_element(memory_display)
	_initialize_element(objective_display)

func _initialize_element(element: Control) -> void:
	if not is_instance_valid(element):
		return
	_element_data[element] = {
		"initial_pos": element.position,
		"current_tween": null
	}
	_start_drift(element)
	_update_shader_intensity(element, 0.0) # Start clear

func _process(delta: float) -> void:
	# Example: Check for snap input (replace "ui_accept" with your actual snap action)
	if Input.is_action_just_pressed("ui_accept"):
		_attempt_snap_all_elements()

func _start_drift(element: Control) -> void:
	if not is_instance_valid(element) or not _element_data.has(element):
		return

	var data = _element_data[element]
	if data.current_tween and data.current_tween.is_running():
		data.current_tween.kill()

	var tween = create_tween()
	tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

	var initial_pos = data.initial_pos
	var current_pos = element.position
	var target_pos = initial_pos + Vector2(
		randf_range(-max_drift_range, max_drift_range),
		randf_range(-max_drift_range, max_drift_range)
	) * _global_drift_intensity

	tween.tween_property(element, "position", target_pos, drift_speed).from(current_pos)
	tween.tween_callback(func(): _start_drift(element)) # Loop by restarting
	data.current_tween = tween

func _snap_to_focus(element: Control) -> void:
	if not is_instance_valid(element) or not _element_data.has(element):
		return

	var data = _element_data[element]
	if data.current_tween and data.current_tween.is_running():
		data.current_tween.kill()

	var snap_tween = create_tween()
	snap_tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

	snap_tween.tween_property(element, "position", data.initial_pos, snap_duration)
	snap_tween.tween_method(Callable(self, "_update_shader_intensity").bind(element), _global_drift_intensity, 0.0, snap_duration)
	snap_tween.tween_callback(func(): _start_drift(element)) # Resume drift after snap
	data.current_tween = snap_tween

func _update_shader_intensity(element: Control, intensity: float) -> void:
	if element and element.material and element.material is ShaderMaterial:
		var shader_material: ShaderMaterial = element.material
		shader_material.set_shader_parameter("drift_intensity", intensity)

func _attempt_snap_all_elements() -> void:
	# Placeholder for actual resource management. Implement your game's focus resource check here.
	# if GlobalGameManager.get_focus_resource() >= snap_focus_cost:
	# 	GlobalGameManager.deplete_focus_resource(snap_focus_cost)
	for element in _element_data.keys():
		_snap_to_focus(element)
	# else:
	# 	print("Not enough focus to snap!")

func set_global_drift_intensity(intensity: float) -> void:
	_global_drift_intensity = clampf(intensity, 0.0, 1.0)
	for element in _element_data.keys():
		_update_shader_intensity(element, _global_drift_intensity)
		# Restart drift to update target positions based on new intensity
		_start_drift(element)
