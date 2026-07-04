extends CharacterBody3D

@export_range(0.0, 1.0, 0.01) var memory_integrity: float = 1.0:
	set(value):
		memory_integrity = clamp(value, min_memory_integrity, max_memory_integrity)
		_update_physics_properties()

@export var min_memory_integrity: float = 0.0
@export var max_memory_integrity: float = 1.0

@export var min_gravity_scale: float = 0.2
@export var max_gravity_scale: float = 1.0

@export var min_friction: float = 0.1
@export var max_friction: float = 1.0

@export var min_linear_damp: float = 0.1
@export var max_linear_damp: float = 1.0

var _physics_material: PhysicsMaterial

func _ready() -> void:
	_initialize_physics_material()
	_update_physics_properties()

func _initialize_physics_material() -> void:
	_physics_material = PhysicsMaterial.new()
	_physics_material.rough = true # Essential for friction to be applied
	physics_material_override = _physics_material

func _update_physics_properties() -> void:
	# Calculate normalized memory value (0 to 1)
	var normalized_memory: float = 0.0
	if max_memory_integrity != min_memory_integrity:
		normalized_memory = (memory_integrity - min_memory_integrity) / (max_memory_integrity - min_memory_integrity)
	else:
		normalized_memory = 0.0 if memory_integrity <= min_memory_integrity else 1.0

	# Interpolate gravity scale
	gravity_scale = lerp(min_gravity_scale, max_gravity_scale, normalized_memory)

	# Interpolate friction for the physics material override
	_physics_material.friction = lerp(min_friction, max_friction, normalized_memory)

	# Interpolate linear damp for the physics material override
	# While CharacterBody3D's kinematic movement doesn't directly use PhysicsMaterial's linear_damp
	# for its own velocity decay, it can affect interactions with other physics bodies.
	# For custom velocity decay, this value can be read and applied manually in the player controller.
	_physics_material.linear_damp = lerp(min_linear_damp, max_linear_damp, normalized_memory)

func add_memory(amount: float) -> void:
	memory_integrity += amount

func lose_memory(amount: float) -> void:
	memory_integrity -= amount
