extends CharacterBody3D

# Constants for base physics properties
const BASE_MOVEMENT_SPEED: float = 8.0
const BASE_ACCELERATION_RATE: float = 15.0
const BASE_DECELERATION_RATE: float = 20.0 # Represents base friction
const BASE_GRAVITY: float = ProjectSettings.get_setting("physics/3d/default_gravity")

# Identity integrity range (0.0 = no self, 1.0 = full self)
@export_range(0.0, 1.0, 0.01) var identity_integrity: float = 1.0:
	set(value):
		identity_integrity = clampf(value, 0.0, 1.0)
		_update_dynamic_physics_factors()

# Factors for how identity integrity influences physics
# Lower integrity -> lighter, more slippery, less control
const MIN_MASS_RESISTANCE_FACTOR: float = 0.2 # How much velocity resists change (lower means more susceptible to forces)
const MAX_MASS_RESISTANCE_FACTOR: float = 1.0 # Normal resistance
const MIN_FRICTION_COEFFICIENT: float = 0.1 # How quickly velocity decays (lower means very slippery)
const MAX_FRICTION_COEFFICIENT: float = 1.0 # Normal friction

# Memory recovery boost properties
const RECOVERY_BOOST_STRENGTH: float = 0.5 # Additional factor for mass/friction during boost
const RECOVERY_BOOST_DURATION: float = 2.0 # Seconds the boost lasts

var _current_mass_resistance: float = MAX_MASS_RESISTANCE_FACTOR
var _current_friction_coefficient: float = MAX_FRICTION_COEFFICIENT
var _recovery_boost_timer: float = 0.0

func _ready() -> void:
	_update_dynamic_physics_factors()

func _physics_process(delta: float) -> void:
	_handle_recovery_boost_timer(delta)
	_apply_gravity(delta)
	_handle_movement_input(delta)
	move_and_slide()

func _update_dynamic_physics_factors() -> void:
	# Map identity integrity to mass resistance and friction coefficients
	_current_mass_resistance = lerp(MIN_MASS_RESISTANCE_FACTOR, MAX_MASS_RESISTANCE_FACTOR, identity_integrity)
	_current_friction_coefficient = lerp(MIN_FRICTION_COEFFICIENT, MAX_FRICTION_COEFFICIENT, identity_integrity)

	# Apply temporary boost from memory recovery if active
	if _recovery_boost_timer > 0.0:
		_current_mass_resistance = min(_current_mass_resistance * (1.0 + RECOVERY_BOOST_STRENGTH), MAX_MASS_RESISTANCE_FACTOR * 1.5)
		_current_friction_coefficient = min(_current_friction_coefficient * (1.0 + RECOVERY_BOOST_STRENGTH), MAX_FRICTION_COEFFICIENT * 1.5)

func _handle_recovery_boost_timer(delta: float) -> void:
	if _recovery_boost_timer > 0.0:
		_recovery_boost_timer -= delta
		if _recovery_boost_timer <= 0.0:
			_recovery_boost_timer = 0.0
			_update_dynamic_physics_factors() # Recalculate factors without the boost

func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= BASE_GRAVITY * delta

func _handle_movement_input(delta: float) -> void:
	var input_direction: Vector3 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_direction.x, 0, input_direction.y)).normalized()

	if direction:
		# Effective acceleration is influenced by mass resistance (lighter means less control/traction)
		var effective_acceleration: float = BASE_ACCELERATION_RATE * _current_mass_resistance
		velocity.x = lerp(velocity.x, direction.x * BASE_MOVEMENT_SPEED, effective_acceleration * delta)
		velocity.z = lerp(velocity.z, direction.z * BASE_MOVEMENT_SPEED, effective_acceleration * delta)
	else:
		# Effective deceleration is directly influenced by friction coefficient
		var effective_deceleration: float = BASE_DECELERATION_RATE * _current_friction_coefficient
		velocity.x = lerp(velocity.x, 0.0, effective_deceleration * delta)
		velocity.z = lerp(velocity.z, 0.0, effective_deceleration * delta)

func lose_memory(amount: float) -> void:
	# Decreases identity integrity, triggering factor recalculation via setter
	identity_integrity -= amount

func recover_memory(amount: float) -> void:
	# Increases identity integrity, triggering factor recalculation via setter
	identity_integrity += amount
	# Activate temporary physical boost
	_recovery_boost_timer = RECOVERY_BOOST_DURATION
	_update_dynamic_physics_factors() # Apply boost immediately

func apply_external_force(force_vector: Vector3) -> void:
	# Lighter (lower mass resistance) means more susceptible to external forces
	# Divide force by mass resistance factor (lower factor results in larger velocity change)
	velocity += force_vector / _current_mass_resistance
