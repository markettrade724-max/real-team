extends CharacterBody3D

# Current identity coherence/memory load.
# 0.0 = light/fragmented, 1.0 = heavy/whole.
# External scripts should update this value.
@export_range(0.0, 1.0, 0.01) var memory_load: float = 0.5:
	set(value):
		memory_load = clampf(value, 0.0, 1.0)
		_update_physical_properties()

# Mass properties: Affects collision response and resistance to external forces.
@export var min_mass: float = 50.0 # Lyra is agile but easily knocked around.
@export var max_mass: float = 200.0 # Lyra is stable but slower to move.

# Friction properties: Affects sliding on surfaces and can influence movement acceleration/deceleration.
@export var min_friction: float = 0.5 # Lyra slides more easily.
@export var max_friction: float = 2.0 # Lyra has more grip, slower acceleration/deceleration.

# Gravity properties: Directly affects fall speed and jump height.
@export var min_gravity_scale: float = 1.0 # Lyra feels lighter, falls slower.
@export var max_gravity_scale: float = 1.5 # Lyra feels heavier, falls faster.

func _ready() -> void:
	# Initialize physical properties based on the starting memory_load.
	_update_physical_properties()

func _update_physical_properties() -> void:
	# Interpolate mass: higher memory_load means higher mass.
	# This makes Lyra more stable against external forces and increases her impact force.
	mass = lerpf(min_mass, max_mass, memory_load)

	# Interpolate friction: higher memory_load means higher friction.
	# This affects how Lyra slides on surfaces and can be used by movement controllers
	# to adjust acceleration/deceleration curves.
	friction = lerpf(min_friction, max_friction, memory_load)

	# Interpolate gravity_scale: higher memory_load means higher gravity_scale.
	# This directly affects Lyra's fall speed and the perceived 'weight' of her jumps.
	gravity_scale = lerpf(min_gravity_scale, max_gravity_scale, memory_load)
