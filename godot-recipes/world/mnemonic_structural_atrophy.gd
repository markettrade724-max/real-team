extends Node3D

@export var memory_id: String = "" # Unique identifier for the memory linked to this structural module.
@export var decay_duration: float = 2.0 # Duration of the visual decay if no AnimationPlayer is used.
@export var erosion_particles_scene: PackedScene # Pre-configured GPUParticles3D scene for erosion effects.
@export var fractured_body_scene: PackedScene # Optional: Pre-fractured RigidBody3D scene to replace this module upon decay.

var _static_body: StaticBody3D
var _mesh_instance: MeshInstance3D
var _animation_player: AnimationPlayer
var _is_decaying: bool = false

func _ready() -> void:
	_static_body = find_child("StaticBody3D")
	_mesh_instance = find_child("MeshInstance3D")	
	_animation_player = find_child("AnimationPlayer")
	
	if not _static_body or not _mesh_instance:
		push_error("MnemonicStructuralAtrophy requires a StaticBody3D and MeshInstance3D child.")
		set_process(false)
		return

	# Connect to a global memory manager signal.
	# Assumes a global singleton named 'MemoryManager' exists and emits 'memory_lost_event'.
	# If 'MemoryManager' doesn't exist, this module won't decay automatically.
	if Engine.has_singleton("MemoryManager"):
		var memory_manager = Engine.get_singleton("MemoryManager")
		if memory_manager.has_signal("memory_lost_event"):
			memory_manager.memory_lost_event.connect(_on_memory_lost_event)
		else:
			push_error("MemoryManager singleton exists but does not emit 'memory_lost_event' signal.")
	else:
		print("MemoryManager singleton not found. Call 'trigger_decay_if_linked' manually for testing.")

# Public method to trigger decay if the lost_memory_id matches this module's memory_id.
# This method would be called by a central manager or directly by game logic.
func trigger_decay_if_linked(lost_memory_id: String) -> void:
	if lost_memory_id == memory_id:
		_start_decay_process()

# Internal handler for the global memory lost event.
func _on_memory_lost_event(lost_memory_id: String) -> void:
	trigger_decay_if_linked(lost_memory_id)

# Initiates the decay process for this specific structural module.
func _start_decay_process() -> void:
	if _is_decaying:
		return

	_is_decaying = true
	print("MnemonicStructuralAtrophy: Decaying module for memory ID: ", memory_id)

	# Disable original static collision using PhysicsServer3D indirectly.
	if _static_body:
		_static_body.set_collision_layer(0)
		_static_body.set_collision_mask(0)
		_static_body.set_deferred("monitoring", false) # Ensure physics server updates

	# Instantiate and play erosion particles (GPUParticles3D).
	if erosion_particles_scene:
		var particles_instance = erosion_particles_scene.instantiate()
		add_child(particles_instance)
		particles_instance.global_transform = global_transform # Position particles at module's location
		if particles_instance is GPUParticles3D:
			particles_instance.emitting = true
			# Automatically free particles after their lifetime.
			var timer = Timer.new()
			timer.wait_time = particles_instance.lifetime + particles_instance.preprocess + 0.1
			timer.one_shot = true
			timer.timeout.connect(particles_instance.queue_free)
			add_child(timer)
			timer.start()

	# Play visual decay animation or hide the mesh.
	if _animation_player and _animation_player.has_animation("decay"):
		_animation_player.play("decay")
		await _animation_player.animation_finished
	else:
		# If no specific animation, fade the mesh over time.
		var tween = create_tween()
		tween.tween_property(_mesh_instance, "modulate", Color(1, 1, 1, 0), decay_duration)
		await tween.finished
		_mesh_instance.hide()

	# Optional: Replace with a fractured RigidBody3D for dynamic destruction.
	if fractured_body_scene:
		var fractured_instance = fractured_body_scene.instantiate()
		get_parent().add_child(fractured_instance)
		fractured_instance.global_transform = global_transform
		if fractured_instance is RigidBody3D:
			# Apply a slight impulse to make pieces fall/scatter using PhysicsServer3D indirectly.
			fractured_instance.apply_central_impulse(Vector3.DOWN * 0.5)
			fractured_instance.apply_torque_impulse(Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * 0.1)
		queue_free() # Remove the original module after replacement.
	else:
		# If no fractured body, ensure the module is no longer interactive.
		_mesh_instance.hide()
		# Consider queue_free() if the module is completely gone and not needed.
		# queue_free()
