extends CharacterBody3D

@export_range(0.0, 1.0, 0.01) var identity_coherence: float = 1.0:
	set(value):
		set_identity_coherence(value)
@export var fluctuation_strength: float = 0.5
@export var base_gravity_scale: float = 1.0
@export var base_friction: float = 1.0
@export var base_bounce: float = 0.0
@export var fluctuation_speed: float = 5.0

var _current_physics_material: PhysicsMaterial

func _ready() -> void:
	# Ensure a PhysicsMaterial override exists for dynamic manipulation.
	# If none is assigned in the editor, create a new one.
	if physics_material_override == null:
		physics_material_override = PhysicsMaterial.new()
	_current_physics_material = physics_material_override
	
	# Store base values from the CharacterBody3D's properties and its material.
	# These serve as the stable baseline for physics fluctuations.
	base_gravity_scale = gravity_scale
	base_friction = _current_physics_material.friction
	base_bounce = _current_physics_material.bounce

func _physics_process(delta: float) -> void:
	_apply_ephemeral_cohesion_effects()

func set_identity_coherence(value: float) -> void:
	# Clamp the identity coherence value to ensure it stays within a valid range.
	identity_coherence = clampf(value, 0.0, 1.0)

func _apply_ephemeral_cohesion_effects() -> void:
	# Calculate a fluctuation factor. Lower identity coherence leads to stronger fluctuations.
	var current_fluctuation_factor: float = (1.0 - identity_coherence) * fluctuation_strength
	
	# Use a time-based offset to create smooth, continuous, and unpredictable fluctuations.
	var time_offset: float = Time.get_ticks_msec() / 1000.0 * fluctuation_speed
	
	# Apply fluctuations to the CharacterBody3D's gravity scale.
	var gravity_fluctuation: float = sin(time_offset * 1.1) * current_fluctuation_factor
	self.gravity_scale = base_gravity_scale + gravity_fluctuation
	
	# Apply fluctuations to the physics material's friction property.
	var friction_fluctuation: float = cos(time_offset * 0.9) * current_fluctuation_factor
	_current_physics_material.friction = clampf(base_friction + friction_fluctuation, 0.0, 1.0)
	
	# Apply fluctuations to the physics material's bounce (restitution) property.
	# Bounce fluctuations are scaled down as they typically have a smaller effective range.
	var bounce_fluctuation: float = sin(time_offset * 1.3) * current_fluctuation_factor * 0.5
	_current_physics_material.bounce = clampf(base_bounce + bounce_fluctuation, 0.0, 1.0)
