extends Node3D
class_name MnemonicSacrificeCatalyst

signal memory_sacrificed(memory_id: String, debuff_data: Dictionary)
signal projectile_fired(memory_id: String)

@export var projectile_scene: PackedScene # Scene for the memory projectile (RigidBody3D)
@export var impact_particles_scene: PackedScene # Scene for impact particles
@export var projectile_speed: float = 50.0
@export var projectile_lifetime: float = 5.0 # How long projectile exists if it doesn't hit anything
@export var projectile_shader: ShaderMaterial # Shader to apply to the projectile mesh

var _lyra_memories: Array[MemoryFragment] = [] # Managed externally, e.g., by a Lyra_Identity_Manager singleton

func _ready() -> void:
	if projectile_scene == null:
		push_error("MnemonicSacrificeCatalyst: 'projectile_scene' is not assigned.")
	if impact_particles_scene == null:
		push_error("MnemonicSacrificeCatalyst: 'impact_particles_scene' is not assigned.")
	if projectile_shader == null:
		push_error("MnemonicSacrificeCatalyst: 'projectile_shader' is not assigned.")

func set_lyra_memories(memories: Array[MemoryFragment]) -> void:
	_lyra_memories = memories

func fire_memory_projectile(memory_fragment: MemoryFragment, target_direction: Vector3, spawn_position: Vector3) -> bool:
	if not is_instance_valid(memory_fragment):
		push_error("MnemonicSacrificeCatalyst: Invalid MemoryFragment provided.")
		return false
	if not _lyra_memories.has(memory_fragment):
		push_error("MnemonicSacrificeCatalyst: Lyra does not possess this memory fragment.")
		return false
	if projectile_scene == null:
		push_error("MnemonicSacrificeCatalyst: Projectile scene not set.")
		return false

	var projectile_instance: RigidBody3D = projectile_scene.instantiate() as RigidBody3D
	if not is_instance_valid(projectile_instance):
		push_error("MnemonicSacrificeCatalyst: Failed to instantiate projectile scene.")
		return false

	get_tree().root.add_child(projectile_instance)
	projectile_instance.global_position = spawn_position
	projectile_instance.look_at(spawn_position + target_direction, Vector3.UP)

	var mesh_instance: MeshInstance3D = projectile_instance.find_child("MeshInstance3D")
	if is_instance_valid(mesh_instance):
		mesh_instance.material_override = projectile_shader.duplicate()

	projectile_instance.apply_central_impulse(target_direction.normalized() * projectile_speed)
	projectile_instance.connect("body_entered", Callable(self, "_on_projectile_impact").bind(memory_fragment, projectile_instance))

	var timer: Timer = Timer.new()
	timer.wait_time = projectile_lifetime
	timer.one_shot = true
	timer.timeout.connect(Callable(projectile_instance, "queue_free"))
	add_child(timer)
	timer.start()

	_remove_memory_from_lyra_identity(memory_fragment)
	emit_signal("projectile_fired", memory_fragment.id)
	return true

func _on_projectile_impact(body: Node3D, memory_fragment: MemoryFragment, projectile_instance: RigidBody3D) -> void:
	if not is_instance_valid(projectile_instance):
		return

	if impact_particles_scene != null:
		var particles_instance: GPUParticles3D = impact_particles_scene.instantiate() as GPUParticles3D
		if is_instance_valid(particles_instance):
			get_tree().root.add_child(particles_instance)
			particles_instance.global_position = projectile_instance.global_position
			particles_instance.emitting = true
			particles_instance.finished.connect(Callable(particles_instance, "queue_free"))

	if body.has_method("take_damage"):
		body.take_damage(10) # Example damage value

	projectile_instance.queue_free()

func _remove_memory_from_lyra_identity(memory_fragment: MemoryFragment) -> void:
	if _lyra_memories.has(memory_fragment):
		_lyra_memories.erase(memory_fragment)
		emit_signal("memory_sacrificed", memory_fragment.id, memory_fragment.debuff_effect)
	else:
		push_warning("MnemonicSacrificeCatalyst: Attempted to remove a memory Lyra does not possess.")
