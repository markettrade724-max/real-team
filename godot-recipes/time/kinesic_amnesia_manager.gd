extends Node

signal amnesia_event_triggered(action_name: String)
signal challenge_started(challenge_sequence: Array[String], duration: float)
signal challenge_input_required(expected_input: String, current_progress: int, total_steps: int)
signal challenge_completed(success: bool, action_name: String)

@export var animation_tree_path: NodePath
@export var amnesia_threshold: float = 0.3
@export var challenge_duration: float = 2.0
@export var min_challenge_length: int = 3
@export var max_challenge_length: int = 5
@export var input_actions: Array[String] = ["ui_up", "ui_down", "ui_left", "ui_right"]

var _identity_resilience: float = 1.0:
	set(value):
		_identity_resilience = clampf(value, 0.0, 1.0)
		_update_kinesic_memory_index()
var _kinesic_memory_index: float = 1.0

var _amnesia_active: bool = false
var _current_challenge_sequence: Array[String]
var _challenge_input_index: int = 0
var _current_action_name: String
var _animation_tree: AnimationTree
var _challenge_timer: Timer

func _ready() -> void:
	_animation_tree = get_node_or_null(animation_tree_path)
	if not _animation_tree:
		push_error("KinesicAmnesiaManager: AnimationTree not found at path %s" % animation_tree_path)
		set_process_input(false)
		return

	_challenge_timer = Timer.new()
	add_child(_challenge_timer)
	_challenge_timer.one_shot = true
	_challenge_timer.timeout.connect(_on_challenge_timer_timeout)
	set_process_input(false)

func set_identity_resilience(value: float) -> void:
	_identity_resilience = value

func _update_kinesic_memory_index() -> void:
	_kinesic_memory_index = _identity_resilience * _identity_resilience

func attempt_complex_movement(action_name: String) -> bool:
	if _amnesia_active:
		return false

	var amnesia_chance = 1.0 - _kinesic_memory_index
	if amnesia_chance > amnesia_threshold and randf() < amnesia_chance:
		_trigger_amnesia_event(action_name)
		return true
	return false

func _trigger_amnesia_event(action_name: String) -> void:
	_amnesia_active = true
	_current_action_name = action_name
	_challenge_input_index = 0
	_current_challenge_sequence = _generate_challenge_sequence()

	_challenge_timer.start(challenge_duration)
	set_process_input(true)

	amnesia_event_triggered.emit(action_name)
	challenge_started.emit(_current_challenge_sequence, challenge_duration)
	_update_animation_blend(false)
	challenge_input_required.emit(_current_challenge_sequence[0], 0, _current_challenge_sequence.size())

func _generate_challenge_sequence() -> Array[String]:
	var sequence_length = randi_range(min_challenge_length, max_challenge_length)
	var sequence: Array[String]
	for _i in range(sequence_length):
		sequence.append(input_actions[randi() % input_actions.size()])
	return sequence

func _input(event: InputEvent) -> void:
	if not _amnesia_active:
		return

	for action in input_actions:
		if event.is_action_pressed(action):
			_process_challenge_input(action)
			get_viewport().set_input_as_handled()
			return

func _process_challenge_input(input_action: String) -> void:
	if input_action == _current_challenge_sequence[_challenge_input_index]:
		_challenge_input_index += 1
		if _challenge_input_index >= _current_challenge_sequence.size():
			_succeed_challenge()
		else:
			challenge_input_required.emit(_current_challenge_sequence[_challenge_input_index], _challenge_input_index, _current_challenge_sequence.size())
	else:
		_fail_challenge()

func _succeed_challenge() -> void:
	_challenge_timer.stop()
	_amnesia_active = false
	set_process_input(false)
	_update_animation_blend(true)
	challenge_completed.emit(true, _current_action_name)

func _fail_challenge() -> void:
	_challenge_timer.stop()
	_amnesia_active = false
	set_process_input(false)
	_update_animation_blend(false)
	challenge_completed.emit(false, _current_action_name)

func _on_challenge_timer_timeout() -> void:
	_fail_challenge()

func _update_animation_blend(success: bool) -> void:
	if _animation_tree:
		var blend_value = 0.0 if success else 1.0
		_animation_tree.set("parameters/KinesicBlend/blend_position", blend_value)
