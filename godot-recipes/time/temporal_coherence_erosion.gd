extends CharacterBody3D

@export_range(0.0, 1.0, 0.01) var temporal_coherence_factor: float = 1.0:
	set(value):
		temporal_coherence_factor = clampf(value, 0.0, 1.0)
		_update_drift_parameters()

@export var max_temporal_drift_per_second: float = 0.2  # Max seconds of drift added/subtracted per second of real time at 0 coherence
@export var max_accumulated_drift: float = 0.5        # Max total accumulated drift (seconds) from real time

var _accumulated_temporal_drift: float = 0.0
var _drift_magnitude_factor: float = 0.0

const SPEED = 5.0
const JUMP_VELOCITY = 4.5

# Get the gravity from the project settings to be synced with the physics server.
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready() -> void:
	_update_drift_parameters()

func _update_drift_parameters() -> void:
	# This factor scales the random drift added each frame.
	# When coherence is 1.0, this is 0.0. When coherence is 0.0, this is 1.0.
	_drift_magnitude_factor = 1.0 - temporal_coherence_factor

func _physics_process(delta: float) -> void:
	var effective_delta: float = _calculate_effective_delta(delta)

	# Add the gravity.
	if not is_on_floor():
		velocity.y -= gravity * effective_delta

	# Handle Jump.
	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = JUMP_VELOCITY

	# Get the input direction and handle the movement/deceleration.
	# Replace UI actions with custom gameplay actions for better practice.
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
	if direction:
		velocity.x = direction.x * SPEED
		velocity.z = direction.z * SPEED
	else:
		velocity.x = move_toward(velocity.x, 0, SPEED)
		velocity.z = move_toward(velocity.z, 0, SPEED)

	move_and_slide()

func _process(delta: float) -> void:
	# This function can be used for non-physics related updates, like animation or camera.
	# Using effective_delta here would make animations desync from real time.
	var effective_delta: float = _calculate_effective_delta(delta)
	# Example: If you had an AnimationPlayer node named 'AnimationPlayer',
	# you could modulate its playback speed or advance it manually:
	# if $AnimationPlayer:
	# 	$AnimationPlayer.playback_speed = 1.0 + _accumulated_temporal_drift * 2.0 # Scale speed based on drift
	# 	$AnimationPlayer.advance(effective_delta) # If manually advancing animation

func _calculate_effective_delta(real_delta: float) -> float:
	# Calculate the amount of drift to add/subtract this frame
	var current_frame_drift: float = (randf() * 2.0 - 1.0) * max_temporal_drift_per_second * _drift_magnitude_factor * real_delta

	# Accumulate the drift
	_accumulated_temporal_drift += current_frame_drift

	# Clamp the accumulated drift to prevent it from becoming too extreme
	_accumulated_temporal_drift = clampf(_accumulated_temporal_drift, -max_accumulated_drift, max_accumulated_drift)

	# The effective delta is the real delta plus the accumulated drift.
	# This means the player's internal clock is either faster or slower than the world's.
	var effective_delta: float = real_delta + _accumulated_temporal_drift

	# Ensure effective_delta doesn't go negative, which could cause issues.
	return maxf(0.0, effective_delta)

# Function to be called by an external memory system to update coherence
func update_memory_integrity(new_integrity_value: float) -> void:
	# Assuming new_integrity_value is between 0.0 (no memory) and 1.0 (full memory)
	temporal_coherence_factor = new_integrity_value
