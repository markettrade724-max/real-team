class_name TemporalEchoManager
extends Node

signal identity_cost_incurred(cost_amount: float)

@export var echo_instance_scene: PackedScene
@export var max_history_size: int = 10
@export var echo_duration: float = 1.0
@export var identity_cost_per_echo: float = 0.1 # Amount of identity lost (0.0 to 1.0)

var _history: Array[Dictionary] = []
var _active_echoes: Array[Node3D] = []

func _ready() -> void:
	if echo_instance_scene == null:
		push_error("TemporalEchoManager: 'echo_instance_scene' is not assigned. Echoes cannot be created.")

# Captures the current state of an object (e.g., Lyra's position/mesh)
# The mesh should be a duplicate if it's going to be modified or freed elsewhere.
func capture_state(transform: Transform3D, mesh: Mesh) -> void:
	if mesh == null:
		push_warning("TemporalEchoManager: Attempted to capture state with null mesh. Skipping.")
		return

	_history.push_front({"transform": transform, "mesh": mesh})
	while _history.size() > max_history_size:
		_history.pop_back()

# Activates an echo from history at a given index
func activate_echo(history_index: int) -> void:
	if history_index < 0 or history_index >= _history.size():
		push_warning("TemporalEchoManager: Invalid history index %d." % history_index)
		return
	if echo_instance_scene == null:
		push_error("TemporalEchoManager: 'echo_instance_scene' is not assigned. Cannot activate echo.")
		return

	var state: Dictionary = _history[history_index]
	var echo_instance: Node3D = echo_instance_scene.instantiate()
	get_tree().current_scene.add_child(echo_instance) # Add to current scene root
	echo_instance.global_transform = state.transform

	# Configure MeshInstance3D
	var mesh_instance: MeshInstance3D = echo_instance.find_child("MeshInstance3D")
	if mesh_instance:
		mesh_instance.mesh = state.mesh
		var material: ShaderMaterial = mesh_instance.get_active_material(0) as ShaderMaterial
		if material:
			material.set_shader_parameter("duration", echo_duration)
			material.set_shader_parameter("start_time", Time.get_ticks_usec() / 1000000.0) # Game time in seconds
		else:
			push_warning("TemporalEchoManager: MeshInstance3D has no ShaderMaterial. Echo will not render correctly.")
	else:
		push_warning("TemporalEchoManager: Echo instance scene missing 'MeshInstance3D' child.")

	# Configure GPUParticles3D
	var particles: GPUParticles3D = echo_instance.find_child("GPUParticles3D")
	if particles:
		particles.lifetime = echo_duration
		particles.emitting = true
	else:
		push_warning("TemporalEchoManager: Echo instance scene missing 'GPUParticles3D' child.")

	# Configure StaticBody3D and CollisionShape3D
	var static_body: StaticBody3D = echo_instance.find_child("StaticBody3D")
	var collision_shape: CollisionShape3D = echo_instance.find_child("CollisionShape3D")
	if static_body and collision_shape:
		var shape: Shape3D = state.mesh.create_convex_shape() if state.mesh else null
		if shape:
			collision_shape.shape = shape
			static_body.set_deferred("monitoring", true) # Enable collision
			static_body.set_deferred("monitorable", true)
		else:
			push_warning("TemporalEchoManager: Could not create collision shape for echo.")
	else:
		push_warning("TemporalEchoManager: Echo instance scene missing 'StaticBody3D' or 'CollisionShape3D' child.")

	_active_echoes.append(echo_instance)
	var timer: Timer = Timer.new()
	timer.wait_time = echo_duration
	timer.one_shot = true
	timer.timeout.connect(Callable(self, "_on_echo_timeout").bind(echo_instance))
	echo_instance.add_child(timer)
	timer.start()

	identity_cost_incurred.emit(identity_cost_per_echo)

func _on_echo_timeout(echo_instance: Node3D) -> void:
	if is_instance_valid(echo_instance):
		_active_echoes.erase(echo_instance)
		echo_instance.queue_free()

# Helper to get the number of available echoes
func get_history_size() -> int:
	return _history.size()

# Helper to clear history (e.g., at episode start)
func clear_history() -> void:
	_history.clear()
