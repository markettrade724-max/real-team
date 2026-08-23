extends Area3D

class_name FractureZone

@export_group("Fracture Properties")
@export_range(0.0, 2.0, 0.01) var gravity_override_strength: float = 1.0: # 1.0 means normal gravity, 0.0 means no gravity, 2.0 means double
	set(value):
		gravity_override_strength = value
		_update_debug_material()
@export var local_gravity_direction: Vector3 = Vector3(0, -1, 0): # Direction of gravity within the zone
	set(value):
		local_gravity_direction = value.normalized()
		_update_debug_material()
@export_range(0.0, 5.0, 0.01) var friction_multiplier: float = 1.0: # Multiplier for character's friction
	set(value):
		friction_multiplier = value
		_update_debug_material()
@export_range(0.0, 1.0, 0.01) var bounce_factor: float = 0.0: # How much character bounces on collision
	set(value):
		bounce_factor = value
		_update_debug_material()

@export_group("Procedural Generation")
@export var randomize_on_ready: bool = false
@export var random_seed: int = 0

var _debug_material: StandardMaterial3D

func _ready() -> void:
	# Connect signals for body entry/exit
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

	# Setup debug visualization
	_setup_debug_material()

	if randomize_on_ready:
		_randomize_properties()

func _setup_debug_material() -> void:
	# Create a simple debug material to visualize the zone's effect
	_debug_material = StandardMaterial3D.new()
	_debug_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_debug_material.albedo_color = Color(0.8, 0.2, 0.8, 0.2) # Purple transparent
	_debug_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# Apply to any MeshInstance3D children if they exist
	for child in get_children():
		if child is MeshInstance3D:
			child.material_override = _debug_material
	_update_debug_material()

func _update_debug_material() -> void:
	if _debug_material:
		# Adjust color based on properties for visual feedback
		var color_hue = (gravity_override_strength + friction_multiplier + bounce_factor) / 7.0 # Normalize roughly
		_debug_material.albedo_color = Color.from_hsv(color_hue, 0.7, 0.8, 0.2)

func _randomize_properties() -> void:
	var rng = RandomNumberGenerator.new()
	rng.seed = random_seed if random_seed != 0 else Time.get_ticks_msec()
	
	gravity_override_strength = rng.randf_range(0.5, 1.5) # From half to 1.5x gravity
	local_gravity_direction = Vector3(rng.randf_range(-1.0, 1.0), rng.randf_range(-1.0, 1.0), rng.randf_range(-1.0, 1.0)).normalized()
	friction_multiplier = rng.randf_range(0.2, 2.0) # From very slippery to very sticky
	bounce_factor = rng.randf_range(0.0, 0.5) # From no bounce to moderate bounce
	
	# Ensure setters are called to update debug material
	_update_debug_material()

func _on_body_entered(body: Node3D) -> void:
	# Check if the entered body is Lyra (CharacterBody3D) and has the required method
	if body is CharacterBody3D and body.has_method("set_kinesthetic_fracture_effect"):
		body.set_kinesthetic_fracture_effect(self)

func _on_body_exited(body: Node3D) -> void:
	# Check if the exited body is Lyra (CharacterBody3D) and has the required method
	if body is CharacterBody3D and body.has_method("clear_kinesthetic_fracture_effect"):
		body.clear_kinesthetic_fracture_effect()

# Public getters for Lyra's script to query
func get_gravity_override_strength() -> float:
	return gravity_override_strength

func get_local_gravity_direction() -> Vector3:
	return local_gravity_direction

func get_friction_multiplier() -> float:
	return friction_multiplier

func get_bounce_factor() -> float:
	return bounce_factor