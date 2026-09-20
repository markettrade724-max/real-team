extends CharacterBody3D

# Signals
signal memory_fragment_dislodged(fragment_node: Node3D)
signal memory_stability_eroded(amount: float)

@export_category("Tremor Settings")
@export_range(0.1, 5.0, 0.1) var tremor_radius: float = 2.0
@export_range(10.0, 500.0, 10.0) var tremor_force: float = 150.0
@export_range(0.01, 1.0, 0.01) var memory_erosion_amount: float = 0.05
@export_range(0.1, 2.0, 0.05) var footfall_velocity_threshold: float = 0.5
@export_range(0.1, 1.0, 0.05) var footfall_cooldown: float = 0.3
@export var memory_fragment_group: String = "memory_fragments"
@export_range(1, 32, 1) var memory_substrate_collision_layer: int = 1 # Layer for memory-substrate ground
@export_range(1, 32, 1) var memory_fragment_collision_layer: int = 2 # Layer for memory fragments
@export var tremor_effect_scene: PackedScene # Visual effect (e.g., CPUParticles3D)

var _time_since_last_footfall: float = 0.0

func _physics_process(delta: float) -> void:
	_time_since_last_footfall += delta
	_detect_and_trigger_footfall()

func _detect_and_trigger_footfall() -> void:
	if not is_on_floor():
		return

	var current_velocity_magnitude: float = velocity.length()
	var vertical_velocity_at_landing: float = -get_floor_normal().dot(velocity) # Velocity component against floor normal

	var landed_hard: bool = vertical_velocity_at_landing > footfall_velocity_threshold
	var moving_fast: bool = current_velocity_magnitude > footfall_velocity_threshold

	if (landed_hard or moving_fast) and _time_since_last_footfall > footfall_cooldown:
		var floor_collider: CollisionObject3D = get_floor_collider()
		if floor_collider and floor_collider.get_collision_layer_value(memory_substrate_collision_layer):
			_trigger_tremor(global_position)
			_time_since_last_footfall = 0.0

func _trigger_tremor(position: Vector3) -> void:
	_apply_tremor_physics(position)
	_spawn_visual_effect(position)
	memory_stability_eroded.emit(memory_erosion_amount)

func _apply_tremor_physics(position: Vector3) -> void:
	var space_state: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = SphereShape3D.new()
	(query.shape as SphereShape3D).radius = tremor_radius
	query.transform = Transform3D(Basis(), position)
	query.collision_mask = 1 << (memory_fragment_collision_layer - 1) # Convert layer number to bitmask
	query.exclude = [self]

	var results: Array[Dictionary] = space_state.intersect_shape(query)

	for result in results:
		var collider: CollisionObject3D = result["collider"]
		if collider is RigidBody3D and collider.is_in_group(memory_fragment_group):
			var direction: Vector3 = (collider.global_position - position).normalized()
			collider.apply_central_impulse(direction * tremor_force + Vector3.UP * tremor_force * 0.5)
			memory_fragment_dislodged.emit(collider)

func _spawn_visual_effect(position: Vector3) -> void:
	if tremor_effect_scene:
		var effect_instance: Node3D = tremor_effect_scene.instantiate()
		get_parent().add_child(effect_instance)
		effect_instance.global_position = position
		if effect_instance is CPUParticles3D:
			effect_instance.emitting = true
		var timer := get_tree().create_timer(2.0) # Example: 2 seconds for effect duration
		timer.timeout.connect(effect_instance.queue_free)
