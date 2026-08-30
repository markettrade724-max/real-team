extends Node

# Signals for memory management and debuffs
signal ephemeral_memory_drained(amount: float)
signal identity_blurred(duration: float, strength: float)

@export var reverb_self_scene: PackedScene # Scene for the Reverb Self ghost
@export var record_duration: float = 3.0 # Duration in seconds to record player actions
@export var memory_cost_per_use: float = 20.0 # Amount of Ephemeral Memory drained per use
@export var blur_duration: float = 1.0 # Duration of the identity blur debuff
@export var blur_strength: float = 0.5 # Strength of the identity blur debuff

var _is_recording: bool = false
var _recorded_frames: Array[Dictionary] = []
var _record_timer: float = 0.0
var _player_node: Node3D # Reference to the player character to record

func _ready() -> void:
	# Attempt to find the player character. This script should ideally be a child
	# of the player or have its _player_node set externally.
	if get_parent() is Node3D:
		_player_node = get_parent()
	else:
		push_warning("ReverberantSelfEcho: Player node not automatically found. Set it via set_player_node().")

func _process(delta: float) -> void:
	if _is_recording:
		_record_timer += delta
		# Store player's global position and rotation for each frame
		_recorded_frames.append({
			"pos": _player_node.global_position,
			"rot": _player_node.global_rotation
		})
		# Stop recording once duration is reached
		if _record_timer >= record_duration:
			_stop_recording()

func start_recording() -> void:
	# Begin recording player's movement and state
	if _is_recording or not is_instance_valid(_player_node):
		return
	_is_recording = true
	_recorded_frames.clear()
	_record_timer = 0.0

func _stop_recording() -> void:
	# Internal function to stop recording
	if not _is_recording:
		return
	_is_recording = false

func activate_reverb_self() -> void:
	# Spawns and activates the Reverb Self ghost using the recorded data
	if _recorded_frames.is_empty():
		return

	if not reverb_self_scene:
		push_error("Reverb Self Scene is not assigned. Cannot activate.")
		return

	var reverb_self_instance: Node3D = reverb_self_scene.instantiate()
	get_tree().current_scene.add_child(reverb_self_instance) # Add to the current scene's root

	# Pass recorded data and recording duration to the Reverb Self instance
	if reverb_self_instance.has_method("play_recorded_sequence"):
		reverb_self_instance.global_position = _recorded_frames[0]["pos"]
		reverb_self_instance.global_rotation = _recorded_frames[0]["rot"]
		reverb_self_instance.call("play_recorded_sequence", _recorded_frames, record_duration)

	# Emit signals for resource management and debuffs
	emit_signal("ephemeral_memory_drained", memory_cost_per_use)
	emit_signal("identity_blurred", blur_duration, blur_strength)

func set_player_node(node: Node3D) -> void:
	# Allows setting the player node reference externally
	_player_node = node

func get_is_recording() -> bool:
	# Returns the current recording status
	return _is_recording
