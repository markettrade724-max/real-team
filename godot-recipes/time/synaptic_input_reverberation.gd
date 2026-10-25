extends CharacterBody3D

class InputEcho:
	var event: InputEvent
	var timestamp: int

	func _init(p_event: InputEvent, p_timestamp: int):
		event = p_event
		timestamp = p_timestamp

var input_buffer: Array[InputEcho] = []
@export var max_buffer_size: int = 200
@export var max_possible_delay: float = 1.0 # Max delay in seconds when identity integrity is 0

# Placeholder for character's identity integrity (0.0 to 1.0)
# 1.0 = full integrity, 0.0 = no integrity
@export var identity_integrity: float = 1.0:
	set(value):
		identity_integrity = clampf(value, 0.0, 1.0)
		_update_input_delay()

@export var move_speed: float = 5.0
@export var jump_strength: float = 10.0
@export var gravity: float = 9.8

var current_input_delay_time: float = 0.0 # Current delay in seconds
var current_velocity: Vector3 = Vector3.ZERO

func _ready():
	_update_input_delay()

func _update_input_delay():
	# Invert integrity: 0.0 integrity -> 1.0 factor, 1.0 integrity -> 0.0 factor
	var integrity_factor = 1.0 - identity_integrity
	current_input_delay_time = max_possible_delay * integrity_factor

func _input(event: InputEvent):
	# Buffer relevant input events (e.g., movement, actions)
	# This captures both pressed and released states for the specified actions.
	if event.is_action("move_forward") or \
	   event.is_action("move_backward") or \
	   event.is_action("move_left") or \
	   event.is_action("move_right") or \
	   event.is_action("jump") or \
	   event.is_action("attack"):
		_add_input_to_buffer(event)

func _add_input_to_buffer(event: InputEvent):
	input_buffer.append(InputEcho.new(event, Time.get_ticks_msec()))
	# Keep buffer size manageable by removing the oldest input if it exceeds the limit.
	if input_buffer.size() > max_buffer_size:
		input_buffer.pop_front()

func _physics_process(delta: float):
	_apply_gravity(delta)
	var echoed_event: InputEvent = _get_echoed_input()
	_process_echoed_input(echoed_event)
	velocity = current_velocity # Update CharacterBody3D's velocity
	move_and_slide()

func _apply_gravity(delta: float):
	if not is_on_floor():
		current_velocity.y -= gravity * delta
	else:
		current_velocity.y = 0.0 # Reset vertical velocity if on floor

func _get_echoed_input() -> InputEvent:
	var target_msec: int = Time.get_ticks_msec() - int(current_input_delay_time * 1000)
	var best_match_event: InputEvent = null

	# Find the most recent input *before or at* the target_msec.
	# Iterate backwards to find the most recent one efficiently.
	for i in range(input_buffer.size() - 1, -1, -1):
		var echo: InputEcho = input_buffer[i]
		if echo.timestamp <= target_msec:
			best_match_event = echo.event
			break # Found the most recent one within the delay window.

	# Clean up old inputs that are no longer relevant.
	_clean_input_buffer()

	return best_match_event

func _clean_input_buffer():
	# Remove inputs older than the earliest possible relevant timestamp.
	# We need to keep inputs that could potentially become the 'echoed' input
	# if the delay changes. So, keep inputs up to `max_possible_delay` seconds old.
	var cleanup_threshold_msec = Time.get_ticks_msec() - int(max_possible_delay * 1000)
	while input_buffer.size() > 0 and input_buffer[0].timestamp < cleanup_threshold_msec:
		input_buffer.pop_front()

func _process_echoed_input(event: InputEvent):
	var input_dir: Vector3 = Vector3.ZERO
	var jumped_this_frame: bool = false

	# Reset horizontal velocity if no input is being processed or if no movement action is echoed.
	current_velocity.x = 0.0
	current_velocity.z = 0.0

	if event:
		if event.is_action_pressed("move_forward"):
			input_dir.z -= 1
		if event.is_action_pressed("move_backward"):
			input_dir.z += 1
		if event.is_action_pressed("move_left"):
			input_dir.x -= 1
		if event.is_action_pressed("move_right"):
			input_dir.x += 1
		if event.is_action_pressed("jump") and is_on_floor():
			current_velocity.y = jump_strength
			jumped_this_frame = true
		# For actions like "attack", trigger them once per echoed press.
		# if event.is_action_pressed("attack"):
		#	_perform_attack()

	# Apply movement based on the echoed input direction.
	if input_dir.length() > 0:
		input_dir = input_dir.normalized()
		current_velocity.x = input_dir.x * move_speed
		current_velocity.z = input_dir.z * move_speed

	# If no jump event was echoed, and the character is on the floor, ensure y velocity is 0.
	# This prevents floating if gravity was applied but no jump occurred.
	if is_on_floor() and not jumped_this_frame:
		current_velocity.y = 0.0
