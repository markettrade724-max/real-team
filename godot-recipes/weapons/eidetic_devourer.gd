extends Node3D
class_name EideticDevourer

@export var weapon_mesh: MeshInstance3D
@export var projectile_scene: PackedScene # A simple sphere or particle emitter
@export var fire_point: Node3D
@export var weapon_material: ShaderMaterial # Assign eidetic_devourer.gdshader here

var current_loaded_shard: MemoryShard = null
var identity_meter: IdentityMeter = null # Global resource instance

func _ready():
	# Assume IdentityMeter is a global autoload or loaded from a path
	# For this recipe, we'll instantiate it if not provided, or assume it's set externally.
	if identity_meter == null:
		identity_meter = IdentityMeter.new()

	if weapon_material:
		weapon_material.set_shader_parameter("shard_color", Color.WHITE)
		weapon_material.set_shader_parameter("effect_intensity", 0.0)
	else:
		push_error("Weapon material not assigned to EideticDevourer.")

func load_shard(shard: MemoryShard):
	if shard == null:
		push_error("Attempted to load a null MemoryShard.")
		return

	current_loaded_shard = shard
	_update_weapon_visuals()
	print("Loaded shard: %s" % shard.shard_name)

func _update_weapon_visuals():
	if weapon_material and current_loaded_shard:
		weapon_material.set_shader_parameter("shard_color", current_loaded_shard.shard_color)
		weapon_material.set_shader_parameter("effect_intensity", current_loaded_shard.damage_modifier)
	elif weapon_material:
		# Reset visuals if no shard is loaded
		weapon_material.set_shader_parameter("shard_color", Color.WHITE)
		weapon_material.set_shader_parameter("effect_intensity", 0.0)

func fire():
	if current_loaded_shard == null:
		print("No memory shard loaded. Firing basic kinetic shot.")
		_fire_projectile(Color.GRAY, 1.0) # Basic shot
		return

	# Consume the shard
	_consume_shard()

	# Fire projectile based on shard properties
	_fire_projectile(current_loaded_shard.shard_color, current_loaded_shard.damage_modifier)

	# Clear loaded shard after consumption
	current_loaded_shard = null
	_update_weapon_visuals() # Reset weapon visuals

func _consume_shard():
	if identity_meter and current_loaded_shard:
		identity_meter.decrease_identity(current_loaded_shard.identity_cost)
		print("Consumed '%s'. Identity remaining: %.2f" % [current_loaded_shard.shard_name, identity_meter.current_identity])
	else:
		push_error("Cannot consume shard: IdentityMeter or current_loaded_shard is null.")

func _fire_projectile(color: Color, damage_mod: float):
	if projectile_scene and fire_point:
		var projectile_instance = projectile_scene.instantiate()
		get_tree().root.add_child(projectile_instance)
		projectile_instance.global_transform = fire_point.global_transform
		# Assuming projectile_instance has a method to set properties
		if projectile_instance.has_method("set_properties"):
			projectile_instance.set_properties(color, damage_mod)
		# Add a simple impulse or velocity if it's a RigidBody3D
		if projectile_instance is RigidBody3D:
			projectile_instance.apply_central_impulse(fire_point.global_transform.basis.z * -20.0 * damage_mod)
	else:
		push_error("Projectile scene or fire point not assigned.")