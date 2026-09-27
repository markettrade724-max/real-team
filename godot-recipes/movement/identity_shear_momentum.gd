extends CharacterBody3D

@export_category("Identity Shear Settings")
@export_var(name: "Identity Coherence", type: float, default: 100.0, hint: "Current identity coherence (0-100)")
var identity_coherence: float = 100.0
@export_var(name: "Max Coherence", type: float, default: 100.0, hint: "Maximum identity coherence")
var max_identity_coherence: float = 100.0
@export_var(name: "Shear Velocity Threshold", type: float, default: 10.0, hint: "Velocity needed to shed a shard")
var shear_velocity_threshold: float = 10.0
@export_var(name: "Shear Damage Threshold", type: float, default: 10.0, hint: "Damage amount to shed a shard")
var shear_damage_threshold: float = 10.0
@export_var(name: "Coherence Loss Rate (per sec)", type: float, default: 0.5, hint: "Passive identity loss per second")
var passive_coherence_loss_rate: float = 0.5
@export_var(name: "Shard Scene Path", type: String, default: "res://scenes/identity_shard.tscn", hint: "Path to the IdentityShard scene")
var shard_scene_path: String = "res://scenes/identity_shard.tscn"
@export_var(name: "Shard Spawn Interval", type: float, default: 0.2, hint: "Minimum time between shard spawns")
var shard_spawn_interval: float = 0.2
@export_var(name: "Shard Detection Radius", type: float, default: 5.0, hint: "Radius to detect nearby shards for _integrate_forces")
var shard_detection_radius: float = 5.0
@export_var(name: "Shard Collision Layer Mask", type: int, default: 1, hint: "Physics layer mask for detecting Identity Shards")
var shard_collision_layer_mask: int = 1 # Default to layer 0 (1 << 0)

var _shard_scene: PackedScene
var _last_shard_spawn_time: float = 0.0
var _current_velocity: Vector3 = Vector3.ZERO

func _ready() -> void:
	_shard_scene = load(shard_scene_path)
	if _shard_scene == null:
		push_error("Failed to load IdentityShard scene at: %s" % shard_scene_path)

func _physics_process(delta: float) -> void:
	_current_velocity = velocity
	_update_identity_coherence(delta)
	_check_and_shed_shard_from_movement()
	_apply_coherence_effects()

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	_apply_shard_forces(state)

func _update_identity_coherence(delta: float) -> void:
	identity_coherence = max(0.0, identity_coherence - passive_coherence_loss_rate * delta)
	identity_coherence = min(max_identity_coherence, identity_coherence)

func _check_and_shed_shard_from_movement() -> void:
	if global_position.distance_to(global_position + _current_velocity * get_physics_process_delta_time()) > shear_velocity_threshold * get_physics_process_delta_time():
		if Engine.get_main_loop().get_process_uptime() - _last_shard_spawn_time > shard_spawn_interval:
			_shed_identity_shard(global_position, -_current_velocity.normalized())
			_last_shard_spawn_time = Engine.get_main_loop().get_process_uptime()

func _apply_coherence_effects() -> void:
	# Example: Reduce movement speed based on coherence loss
	var coherence_factor: float = identity_coherence / max_identity_coherence
	# This is where Lyra's base movement (e.g., speed) would be modified.
	# For instance, if you have a 'speed' variable:
	# speed = base_speed * (0.5 + 0.5 * coherence_factor)
	pass # Placeholder for actual movement modification

func take_damage(amount: float) -> void:
	identity_coherence = max(0.0, identity_coherence - amount)
	if amount >= shear_damage_threshold:
		_shed_identity_shard(global_position, Vector3.UP) # Shed upwards on damage
	identity_coherence = min(max_identity_coherence, identity_coherence)

func _shed_identity_shard(position: Vector3, direction: Vector3) -> void:
	if _shard_scene == null:
		return

	var shard_instance: Area3D = _shard_scene.instantiate()
	get_tree().current_scene.add_child(shard_instance)
	shard_instance.global_position = position
	if shard_instance.has_method("initialize_shard"):
		shard_instance.initialize_shard(direction)
	identity_coherence = max(0.0, identity_coherence - 1.0) # Small coherence cost per shard

func _apply_shard_forces(state: PhysicsDirectBodyState3D) -> void:
	var total_shard_force: Vector3 = Vector3.ZERO
	var query = PhysicsShapeQueryParameters3D.new()
	query.shape = SphereShape3D.new()
	query.shape.radius = shard_detection_radius
	query.transform.origin = global_position
	query.collision_mask = shard_collision_layer_mask

	var results = get_world_3d().direct_space_state.intersect_shape(query)
	for result in results:
		var collider = result.collider
		if collider is Area3D and collider.has_method("get_shard_effect_force"):
			var shard_force: Vector3 = collider.get_shard_effect_force(global_position, state.linear_velocity)
			total_shard_force += shard_force

	state.apply_central_force(total_shard_force)
