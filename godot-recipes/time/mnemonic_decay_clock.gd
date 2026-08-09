@tool
extends Node3D

signal area_decayed(area_node: Node3D)
signal dissolution_progress_updated(progress: float)

@export_range(0.1, 60.0, 0.1) var decay_interval: float = 5.0:
	set(value):
		decay_interval = value
		if is_node_ready():
			_setup_timer()

@export var total_decay_duration: float = 60.0 # Total time until all memories are gone
@export var decay_root_path: NodePath # Path to a Node3D containing all decayable RigidBody3D nodes (initially MODE_STATIC)
@export var dissolve_shader_material_template: ShaderMaterial # Template for per-mesh shader materials

var _decay_timer: Timer
var _decayable_bodies: Array[RigidBody3D]
var _decayed_count: int = 0
var _total_areas: int = 0

func _ready() -> void:
	_setup_timer()
	_initialize_decay_bodies()
	_update_dissolution_progress()

func _setup_timer() -> void:
	if _decay_timer:
		_decay_timer.queue_free()
	_decay_timer = Timer.new()
	add_child(_decay_timer)
	_decay_timer.wait_time = decay_interval
	_decay_timer.autostart = true
	_decay_timer.timeout.connect(_on_decay_timer_timeout)

func _initialize_decay_bodies() -> void:
	if not decay_root_path:
		return

	var root_node: Node3D = get_node_or_null(decay_root_path)
	if not root_node:
		push_warning("Decay root node not found at path: %s" % decay_root_path)
		return

	_decayable_bodies.clear()
	for child in root_node.get_children():
		if child is RigidBody3D:
			_decayable_bodies.append(child)
			# Assume MeshInstance3D is a child of RigidBody3D
			for mesh_child in child.get_children():
				if mesh_child is MeshInstance3D and dissolve_shader_material_template:
					var new_mat: ShaderMaterial = dissolve_shader_material_template.duplicate()
					new_mat.set_shader_parameter("dissolve_amount", 0.0)
					mesh_child.material_override = new_mat
					break # Only apply to the first MeshInstance3D found
	_total_areas = _decayable_bodies.size()
	_decayable_bodies.shuffle() # Randomize decay order

func _on_decay_timer_timeout() -> void:
	if _decayable_bodies.is_empty():
		_decay_timer.stop()
		return

	var body_to_decay: RigidBody3D = _decayable_bodies.pop_front()
	if body_to_decay:
		_start_body_decay(body_to_decay)
		_decayed_count += 1
		area_decayed.emit(body_to_decay)
		_update_dissolution_progress()

func _start_body_decay(rigid_body: RigidBody3D) -> void:
	rigid_body.mode = RigidBody3D.MODE_RIGID # Make it fall
	rigid_body.set_linear_velocity(Vector3(randf_range(-1, 1), randf_range(0, 2), randf_range(-1, 1)) * 2.0) # Initial push

	# Start visual dissolution on its MeshInstance3D child
	for child in rigid_body.get_children():
		if child is MeshInstance3D and child.material_override is ShaderMaterial:
			var tween: Tween = create_tween()
			tween.tween_property(child.material_override, "shader_parameter/dissolve_amount", 1.0, 2.0).set_ease(Tween.EASE_IN_OUT)
			tween.tween_callback(Callable(child, "set_visible").bind(false))
			tween.play()
			break # Only apply to the first MeshInstance3D found

func _update_dissolution_progress() -> void:
	if _total_areas == 0:
		dissolution_progress_updated.emit(0.0)
		return
	var progress: float = float(_decayed_count) / _total_areas
	dissolution_progress_updated.emit(progress)
