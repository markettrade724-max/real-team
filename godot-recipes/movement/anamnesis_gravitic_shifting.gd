extends CharacterBody3D

# --- Exported Parameters ---
@export_group("Memory Density Settings")
@export_range(0.0, 100.0, 0.1, "suffix:%") var memory_density_min: float = 0.0
@export_range(0.0, 100.0, 0.1, "suffix:%") var memory_density_max: float = 100.0
@export var memory_change_amount: float = 10.0 # Default amount of density changed per fragment

@export_group("Mass & Gravity Settings")
@export_range(1.0, 1000.0, 1.0, "suffix:kg") var min_mass: float = 50.0
@export_range(1.0, 1000.0, 1.0, "suffix:kg") var max_mass: float = 200.0
@export_range(0.1, 5.0, 0.1) var min_gravity_scale: float = 0.5
@export_range(0.1, 5.0, 0.1) var max_gravity_scale: float = 2.0

@export_group("Movement Settings")
@export var base_speed: float = 5.0
@export var base_jump_velocity: float = 4.5
@export_range(0.0, 1.0, 0.05) var jump_force_mass_modifier: float = 0.75 # How much mass affects jump force (0.0 = no effect, 1.0 = direct inverse)

# --- Internal State ---
var _current_memory_density: float = 50.0 # Initial memory density
var _current_jump_velocity: float = 0.0
var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

# --- Signals ---
signal memory_density_changed(new_density: float, mass: float, gravity_scale: float)

# --- Godot Lifecycle Methods ---
func _ready() -> void:
	# Initialize with current memory density
	_recalibrate_mass_and_gravity()

func _physics_process(delta: float) -> void:
	# Apply gravity
	if not is_on_floor():
		velocity.y -= _gravity * self.gravity_scale * delta

	# Handle jump input (example, replace with actual input)
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = _current_jump_velocity

	# Get the input direction and handle the movement.
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
	if direction:
		velocity.x = direction.x * base_speed
		velocity.z = direction.z * base_speed
	else:
		velocity.x = move_toward(velocity.x, 0, base_speed)
		velocity.z = move_toward(velocity.z, 0, base_speed)

	move_and_slide()

# --- Public Methods for Memory Management ---
func collect_memory_fragment(amount: float = -1.0) -> void:
	if amount < 0:
		amount = memory_change_amount
	_current_memory_density = clamp(_current_memory_density + amount, memory_density_min, memory_density_max)
	_recalibrate_mass_and_gravity()

func lose_memory_fragment(amount: float = -1.0) -> void:
	if amount < 0:
		amount = memory_change_amount
	_current_memory_density = clamp(_current_memory_density - amount, memory_density_min, memory_density_max)
	_recalibrate_mass_and_gravity()

# --- Core Recalibration Logic ---
func _recalibrate_mass_and_gravity() -> void:
	# Calculate normalized memory density ratio (0.0 to 1.0)
	var density_range: float = memory_density_max - memory_density_min
	var memory_density_ratio: float = 0.0
	if density_range > 0:
		memory_density_ratio = (_current_memory_density - memory_density_min) / density_range

	# Adjust mass and gravity_scale based on the ratio
	# Higher ratio (more memory) -> higher mass, higher gravity_scale
	self.mass = lerp(min_mass, max_mass, memory_density_ratio)
	self.gravity_scale = lerp(min_gravity_scale, max_gravity_scale, memory_density_ratio)

	# Adjust jump velocity: heavier characters jump less high
	# Using an inverse relationship based on the mass_modifier
	_current_jump_velocity = base_jump_velocity * (1.0 - memory_density_ratio * jump_force_mass_modifier)
	_current_jump_velocity = max(0.1, _current_jump_velocity) # Ensure jump velocity doesn't go to zero

	# Emit signal for other systems to react
	emit_signal("memory_density_changed", _current_memory_density, self.mass, self.gravity_scale)

# --- Utility Getters (Optional, for external access) ---
func get_current_memory_density() -> float:
	return _current_memory_density

func get_current_mass() -> float:
	return self.mass

func get_current_gravity_scale() -> float:
	return self.gravity_scale

func get_current_jump_velocity() -> float:
	return _current_jump_velocity
