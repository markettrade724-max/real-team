extends Node

@export var ripple_shader_path: String = "res://causal_echo_distortion.gdshader"
@export var default_ripple_duration: float = 3.0
@export var default_ripple_intensity: float = 0.5
@export var default_ripple_speed: float = 2.0
@export var default_pre_trigger_offset: float = 0.2 # seconds, how much earlier cues appear

var _ripple_active: bool = false
var _current_shader_material: ShaderMaterial = null
var _ripple_timer: Timer = null
var _current_pre_trigger_offset: float = 0.0 # Stores the active offset

func _ready() -> void:
	_ripple_timer = Timer.new()
	add_child(_ripple_timer)
	_ripple_timer.one_shot = true
	_ripple_timer.timeout.connect(_on_ripple_timer_timeout)

	load_shader_material()

func load_shader_material() -> void:
	var shader_res = load(ripple_shader_path)
	if not shader_res is Shader:
		push_error("CausalEchoManager: Failed to load shader at path: %s" % ripple_shader_path)
		return

	_current_shader_material = ShaderMaterial.new()
	_current_shader_material.shader = shader_res
	_current_shader_material.set_shader_parameter("ripple_active", false) # Start inactive
	_current_shader_material.set_shader_parameter("ripple_intensity", 0.0)
	_current_shader_material.set_shader_parameter("ripple_speed", default_ripple_speed)

func activate_ripple(duration: float = -1.0, intensity: float = -1.0, speed: float = -1.0, pre_trigger_offset: float = -1.0) -> void:
	if _ripple_active:
		return

	_ripple_active = true
	var current_duration = default_ripple_duration if duration < 0 else duration
	var current_intensity = default_ripple_intensity if intensity < 0 else intensity
	var current_speed = default_ripple_speed if speed < 0 else speed
	_current_pre_trigger_offset = default_pre_trigger_offset if pre_trigger_offset < 0 else pre_trigger_offset

	if _current_shader_material:
		_current_shader_material.set_shader_parameter("ripple_active", true)
		_current_shader_material.set_shader_parameter("ripple_intensity", current_intensity)
		_current_shader_material.set_shader_parameter("ripple_speed", current_speed)

	_ripple_timer.wait_time = current_duration
	_ripple_timer.start()

	print("Ripple activated with pre-trigger offset: %f seconds" % _current_pre_trigger_offset)

func deactivate_ripple() -> void:
	if not _ripple_active:
		return

	_ripple_active = false
	if _current_shader_material:
		_current_shader_material.set_shader_parameter("ripple_active", false)
		_current_shader_material.set_shader_parameter("ripple_intensity", 0.0) # Ensure it fades out

	_ripple_timer.stop()
	_current_pre_trigger_offset = 0.0
	print("Ripple deactivated.")

func _on_ripple_timer_timeout() -> void:
	deactivate_ripple()

func is_ripple_active() -> bool:
	return _ripple_active

func get_current_shader_material() -> ShaderMaterial:
	return _current_shader_material

# This function is for other game objects to schedule their visual/auditory cues.
# `callable_cue`: The Callable (e.g., func() -> play_sound(), func() -> show_crumble_effect())
# `actual_event_delay`: The time (in seconds) from *now* until the actual game logic event occurs.
func schedule_pre_triggered_cue(callable_cue: Callable, actual_event_delay: float) -> void:
	if not _ripple_active:
		callable_cue.call_deferred() # If ripple is off, just call the cue normally
		return

	var pre_trigger_delay = actual_event_delay - _current_pre_trigger_offset

	if pre_trigger_delay <= 0.0:
		# If the calculated pre-trigger time is now or in the past, trigger immediately
		callable_cue.call_deferred()
		print("Pre-triggered cue for %s called immediately (actual event at %f)" % [callable_cue, actual_event_delay])
	else:
		# Schedule the cue for the calculated pre-trigger time
		var temp_timer = Timer.new()
		add_child(temp_timer)
		temp_timer.one_shot = true
		temp_timer.wait_time = pre_trigger_delay
		temp_timer.timeout.connect(func():
			callable_cue.call_deferred()
			temp_timer.queue_free()
		)
		temp_timer.start()
		print("Scheduled pre-triggered cue for %s at delay %f (actual event at %f)" % [callable_cue, pre_trigger_delay, actual_event_delay])
