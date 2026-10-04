extends Control

@export_range(0.0, 1.0, 0.01) var decay_rate: float = 0.05 # How fast decay progresses per second
@export var stabilization_taps_required: int = 3 # How many taps to stabilize
@export var stabilization_window_time: float = 0.5 # Time in seconds to perform taps

var _current_decay_amount: float = 0.0
var _decay_active: bool = false
var _stabilized: bool = true
var _tap_count: int = 0
var _stabilization_timer: float = 0.0

func _ready() -> void:
	# Ensure the Control node has a ShaderMaterial
	if not material is ShaderMaterial:
		push_error("Control node requires a ShaderMaterial for 'The Fading Command' mechanic.")
		set_process(false)
		return
	_update_shader_decay()
	mouse_filter = MOUSE_FILTER_STOP # Allow _gui_input to capture events

func _process(delta: float) -> void:
	_handle_decay_progression(delta)
	_handle_stabilization_timer(delta)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_attempt_stabilization_tap()
		get_viewport().set_input_as_handled() # Prevent other UI elements from reacting

func start_decay() -> void:
	if _stabilized:
		_stabilized = false
		_decay_active = true
		_current_decay_amount = 0.0
		_tap_count = 0
		_stabilization_timer = stabilization_window_time
		_update_shader_decay()
		mouse_filter = MOUSE_FILTER_STOP # Ensure input is captured

func stop_decay_and_reset() -> void:
	_decay_active = false
	_stabilized = true
	_current_decay_amount = 0.0
	_tap_count = 0
	_stabilization_timer = 0.0
	_update_shader_decay()
	mouse_filter = MOUSE_FILTER_STOP # Reset to default interactive state

func _handle_decay_progression(delta: float) -> void:
	if _decay_active and not _stabilized:
		_current_decay_amount += decay_rate * delta
		_current_decay_amount = clampf(_current_decay_amount, 0.0, 1.0)
		_update_shader_decay()

		if _current_decay_amount >= 1.0:
			_on_decay_complete()

func _handle_stabilization_timer(delta: float) -> void:
	if _stabilization_timer > 0:
		_stabilization_timer -= delta
		if _stabilization_timer <= 0:
			_reset_tap_count()

func _attempt_stabilization_tap() -> void:
	if _decay_active and not _stabilized:
		_tap_count += 1
		_stabilization_timer = stabilization_window_time # Reset timer on tap

		if _tap_count >= stabilization_taps_required:
			_on_stabilized()

func _reset_tap_count() -> void:
	_tap_count = 0

func _on_stabilized() -> void:
	print("UI element stabilized!")
	stop_decay_and_reset()

func _on_decay_complete() -> void:
	print("UI element fully decayed! It is now non-functional.")
	_decay_active = false
	_stabilized = false # It's decayed, not stabilized
	mouse_filter = MOUSE_FILTER_IGNORE # Make it non-interactive

func _update_shader_decay() -> void:
	if material is ShaderMaterial:
		(material as ShaderMaterial).set_shader_parameter("decay_amount", _current_decay_amount)
