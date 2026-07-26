extends CharacterBody3D

@export_range(0.0, 1.0, 0.01) var identity_integrity: float = 1.0: # 1.0 is full identity, 0.0 is complete loss
	set(value):
		identity_integrity = clampf(value, 0.0, 1.0)
		_update_target_gravity_scale()

@export var normal_gravity_multiplier: float = 1.0 # Multiplier for project's default gravity when identity is full
@export var min_gravity_multiplier: float = 0.1 # Minimum gravity multiplier when identity is completely lost
@export var gravity_lerp_speed: float = 5.0 # How quickly gravity adjusts to new integrity value

var _current_target_gravity_multiplier: float = 0.0
var _zone_gravity_modifier: float = 1.0 # Multiplier for local environmental effects (e.g., 0.5 for lighter zone)

func _ready() -> void:
	_update_target_gravity_scale()
	# Initialize the CharacterBody3D's gravity_scale property directly
	gravity_scale = _current_target_gravity_multiplier * _zone_gravity_modifier

func _physics_process(delta: float) -> void:
	# Smoothly interpolate the CharacterBody3D's gravity_scale property.
	# This property is a multiplier of the project's default gravity, affecting velocity.y automatically.
	var target_scale = _current_target_gravity_multiplier * _zone_gravity_modifier
	gravity_scale = lerpf(gravity_scale, target_scale, delta * gravity_lerp_speed)

func _update_target_gravity_scale() -> void:
	# Calculate the target gravity multiplier based on identity integrity.
	# Lerp from min_gravity_multiplier (0.0 integrity) to normal_gravity_multiplier (1.0 integrity).
	_current_target_gravity_multiplier = lerpf(min_gravity_multiplier, normal_gravity_multiplier, identity_integrity)

func set_identity_integrity(new_integrity: float) -> void:
	# Public method to update identity integrity.
	# The setter will automatically call _update_target_gravity_scale().
	identity_integrity = new_integrity

func apply_zone_gravity_modifier(modifier: float) -> void:
	# Apply a temporary multiplier from environmental memory stability zones.
	# A modifier of 1.0 means normal zone gravity, <1.0 means lighter, >1.0 means heavier.
	_zone_gravity_modifier = modifier

func reset_zone_gravity_modifier() -> void:
	# Resets the environmental gravity modifier to its default (no modification).
	_zone_gravity_modifier = 1.0
