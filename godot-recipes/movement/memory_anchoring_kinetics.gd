	# memory_anchoring_kinetics.gd
	extends CharacterBody3D

	@export_range(0.0, 1.0, 0.01) var memory_coherence: float = 0.5:
		set(value):
			memory_coherence = clampf(value, 0.0, 1.0)
			_update_kinetics()

	# Base physics properties
	@export var base_gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")
	@export var base_speed: float = 5.0

	# Coherence-dependent ranges
	@export_group("Gravity Scale")
	@export var min_gravity_scale: float = 0.5 # Lighter, floatier at low coherence
	@export var max_gravity_scale: float = 1.5 # Heavier, more grounded at high coherence

	@export_group("Friction")
	@export var min_friction: float = 0.1 # Slippery at low coherence
	@export var max_friction: float = 0.8 # Grippy at high coherence

	@export_group("Speed Factor")
	@export var min_speed_factor: float = 0.8 # Slower at high coherence
	@export var max_speed_factor: float = 1.2 # Faster at low coherence

	@export_group("Resistance Factor (for external forces)")
	@export var min_resistance_factor: float = 0.2 # Easily pushed at low coherence
	@export var max_resistance_factor: float = 1.5 # Resists pushes at high coherence

	# Current calculated values
	var current_gravity_scale: float = 1.0
	var current_friction: float = 0.5
	var current_speed_factor: float = 1.0
	var current_resistance_factor: float = 1.0

	func _ready() -> void:
		_update_kinetics()

	func _physics_process(delta: float) -> void:
		# Apply gravity
		if not is_on_floor():
			velocity.y -= base_gravity * current_gravity_scale * delta

		# Example movement logic (replace with actual player input handling)
		var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
		var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

		if direction:
			velocity.x = direction.x * base_speed * current_speed_factor
			velocity.z = direction.z * base_speed * current_speed_factor
		else:
			velocity.x = move_toward(velocity.x, 0, base_speed * current_friction * delta)
			velocity.z = move_toward(velocity.z, 0, base_speed * current_friction * delta)

		move_and_slide()

	func _update_kinetics() -> void:
		# Interpolate properties based on memory_coherence
		# Higher coherence (closer to 1.0) means more 'substance' (heavier, grippier, slower)
		current_gravity_scale = lerpf(min_gravity_scale, max_gravity_scale, memory_coherence)
		current_friction = lerpf(min_friction, max_friction, memory_coherence)
		
		# Speed factor is inverse: lower coherence (closer to 0.0) means faster
		current_speed_factor = lerpf(max_speed_factor, min_speed_factor, memory_coherence)
		
		current_resistance_factor = lerpf(min_resistance_factor, max_resistance_factor, memory_coherence)

	func add_memory_shard(amount: float) -> void:
		self.memory_coherence += amount

	func lose_memory_shard(amount: float) -> void:
		self.memory_coherence -= amount

	func get_current_resistance_factor() -> float:
		return current_resistance_factor
