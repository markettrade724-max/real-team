extends CharacterBody3D

@export_group("Base Movement Parameters")
@export var base_speed: float = 5.0
@export var base_jump_velocity: float = 4.5
@export var base_gravity_scale: float = 1.0 # Multiplier for ProjectSettings.physics/3d/default_gravity
@export var base_friction: float = 0.8 # Affects how quickly velocity decays on ground

@export_group("Memory Integrity")
@export_range(0.0, 1.0, 0.01) var memory_integrity: float = 1.0:
	set(value):
		memory_integrity = clampf(value, 0.0, 1.0)
		_update_movement_parameters() # Update movement immediately when integrity changes
@export var integrity_degradation_factor: float = 0.5 # How much 1.0 integrity loss affects base stats (e.g., 0.5 means 50% reduction at 0 integrity)

@export_group("Memory Shard Boosts")
@export var memory_shard_boost_strength: float = 0.2 # Flat bonus to memory_integrity for temporary boost
@export var memory_shard_boost_duration: float = 5.0 # Duration of temporary boost in seconds

# Internal state variables
var _current_speed: float
var _current_jump_velocity: float
var _current_gravity: float
var _current_friction: float
var _is_boosting: bool = false
var _boost_timer: float = 0.0

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	_update_movement_parameters()

# Called every physics frame.
func _physics_process(delta: float) -> void:
	_apply_gravity(delta)
	_handle_movement_input()
	_handle_jump_input()
	_update_boost_timer(delta)
	move_and_slide()

# Updates movement parameters based on current memory integrity and boost state.
func _update_movement_parameters() -> void:
	# Calculate base degradation based on memory_integrity
	var integrity_multiplier = 1.0 - (1.0 - memory_integrity) * integrity_degradation_factor

	_current_speed = base_speed * integrity_multiplier
	_current_jump_velocity = base_jump_velocity * integrity_multiplier
	# Gravity increases as integrity decreases, making jumps harder
	_current_gravity = ProjectSettings.get_setting("physics/3d/default_gravity").x * base_gravity_scale * (1.0 + (1.0 - integrity_multiplier) * 0.5)
	_current_friction = base_friction * integrity_multiplier

	# Apply temporary boost if active
	if _is_boosting:
		_current_speed *= (1.0 + memory_shard_boost_strength)
		_current_jump_velocity *= (1.0 + memory_shard_boost_strength)
		_current_gravity /= (1.0 + memory_shard_boost_strength * 0.5) # Boost reduces gravity slightly
		_current_friction *= (1.0 + memory_shard_boost_strength)

# Applies gravity to the character's velocity.
func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _current_gravity * delta

# Handles player input for horizontal movement.
func _handle_movement_input() -> void:
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	if direction:
		velocity.x = direction.x * _current_speed
		velocity.z = direction.z * _current_speed
	else:
		# Apply friction when not moving
		velocity.x = move_toward(velocity.x, 0, _current_speed * _current_friction)
		velocity.z = move_toward(velocity.z, 0, _current_speed * _current_friction)

# Handles player input for jumping.
func _handle_jump_input() -> void:
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = _current_jump_velocity

# Reduces memory integrity.
func take_memory_damage(amount: float) -> void:
	memory_integrity -= amount

# Recovers memory integrity and optionally applies a temporary boost.
func recover_memory_shard(amount: float, temporary_boost: bool = false) -> void:
	memory_integrity += amount
	if temporary_boost:
		_apply_temporary_boost()

# Starts a temporary movement boost.
func _apply_temporary_boost() -> void:
	_is_boosting = true
	_boost_timer = memory_shard_boost_duration
	_update_movement_parameters() # Apply boost immediately

# Updates the boost timer and ends the boost if time runs out.
func _update_boost_timer(delta: float) -> void:
	if _is_boosting:
		_boost_timer -= delta
		if _boost_timer <= 0.0:
			_end_temporary_boost()

# Ends the temporary movement boost.
func _end_temporary_boost() -> void:
	_is_boosting = false
	_update_movement_parameters() # Revert to non-boosted parameters
