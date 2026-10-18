@tool
extends Control

# --- Exported Properties ---
@export_range(0.0, 1.0, 0.01) var identity_integrity_score: float = 1.0:
	set(value):
		identity_integrity_score = clampf(value, 0.0, 1.0)
		_update_visual_effects()

@export var drift_strength: float = 50.0 # Max pixels to drift from original position
@export var drift_duration: float = 0.2 # How long a drift animation takes
@export var max_required_inputs: int = 3 # Max clicks needed at 0 integrity

# --- Internal State ---
var _original_position: Vector2
var _original_scale: Vector2
var _tween: Tween
var _current_required_inputs: int = 1
var _input_counter: int = 0
var _is_drifting: bool = false
var _shader_material: ShaderMaterial

# --- Godot Lifecycle Methods ---
func _ready() -> void:
	_original_position = position
	_original_scale = scale
	_setup_shader()
	_update_visual_effects()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if _is_drifting:
				# If drifting, consume the input but don't process it immediately
				get_viewport().set_input_as_handled()
				return

			var integrity_factor = 1.0 - identity_integrity_score # 0.0 (perfect) to 1.0 (lost)
			if integrity_factor > 0.0:
				# Calculate required inputs based on integrity
				_current_required_inputs = int(lerp(1.0, float(max_required_inputs), integrity_factor))
				_input_counter += 1

				if _input_counter < _current_required_inputs:
					# Input not enough, trigger drift and consume
					_trigger_drift()
					get_viewport().set_input_as_handled()
					return
				else:
					# Input successful, reset counter
					_input_counter = 0
					# Allow the input to pass through to the base Control's handlers
					pass
			else:
				# Perfect integrity, allow input
				pass
	# For other input types or if integrity is perfect, let it pass
	pass

# --- Private Helper Methods ---
func _setup_shader() -> void:
	# Find a Label child to apply the shader to (e.g., for a Button's text)
	var label_child: Label = null
	for child in get_children():
		if child is Label:
			label_child = child
			break
		elif child is Button and child.get_label() != null:
			label_child = child.get_label()
			break

	if label_child:
		_shader_material = ShaderMaterial.new()
		_shader_material.shader = load("res://mnemic_will_not_comply_interface.gdshader")
		label_child.material = _shader_material
		_update_shader_parameters()

func _update_visual_effects() -> void:
	_update_shader_parameters()

func _update_shader_parameters() -> void:
	if _shader_material:
		var illegibility_factor = 1.0 - identity_integrity_score
		_shader_material.set_shader_parameter("dissolve_factor", illegibility_factor)

func _trigger_drift() -> void:
	if _tween and _tween.is_running():
		_tween.kill()

	_tween = create_tween()
	_tween.set_trans(Tween.TRANS_SINE)
	_tween.set_ease(Tween.EASE_OUT)

	var integrity_factor = 1.0 - identity_integrity_score
	var current_drift_strength = lerp(0.0, drift_strength, integrity_factor)
	var current_drift_duration = lerp(0.0, drift_duration, integrity_factor)

	var target_position = _original_position + Vector2(
		randf_range(-current_drift_strength, current_drift_strength),
		randf_range(-current_drift_strength, current_drift_strength)
	)
	var target_scale = _original_scale * lerp(1.0, 0.8, integrity_factor) # Shrink slightly

	_is_drifting = true
	_tween.tween_property(self, "position", target_position, current_drift_duration)
	_tween.tween_property(self, "scale", target_scale, current_drift_duration)
	_tween.tween_callback(Callable(self, "_reset_drift")).set_delay(current_drift_duration)

func _reset_drift() -> void:
	if _tween and _tween.is_running():
		_tween.kill()

	_tween = create_tween()
	_tween.set_trans(Tween.TRANS_SINE)
	_tween.set_ease(Tween.EASE_IN)

	_tween.tween_property(self, "position", _original_position, drift_duration * 0.5)
	_tween.tween_property(self, "scale", _original_scale, drift_duration * 0.5)
	_tween.tween_callback(Callable(self, "_on_drift_reset_complete"))

func _on_drift_reset_complete() -> void:
	_is_drifting = false
	_input_counter = 0 # Reset input counter after drift