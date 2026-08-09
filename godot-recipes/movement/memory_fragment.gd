extends RigidBody3D

@export_range(1.0, 10.0, 0.1) var decay_time: float = 5.0
@export var kick_off_strength: float = 10.0
@export var initial_decay_impulse: float = 5.0
@export var decay_visual_effect_duration: float = 0.5

var _decay_timer: Timer
var _is_decaying: bool = false
var _decay_progress: float = 0.0

func _ready() -> void:
	_decay_timer = Timer.new()
	add_child(_decay_timer)
	_decay_timer.wait_time = decay_time
	_decay_timer.one_shot = true
	_decay_timer.timeout.connect(_on_decay_timer_timeout)
	_decay_timer.start()
	set_physics_process(true)

func _physics_process(delta: float) -> void:
	if _is_decaying and _decay_progress < 1.0:
		_decay_progress += delta / decay_visual_effect_duration
		# Example visual feedback: scale down or change color
		# var mesh_instance = get_node_or_null("MeshInstance3D")
		# if mesh_instance:
		# 	mesh_instance.scale = Vector3.ONE * (1.0 - _decay_progress * 0.2)
		# 	var mat = mesh_instance.get_active_material(0) as StandardMaterial3D
		# 	if mat:
		# 		mat.albedo_color = Color.WHITE.lerp(Color.RED, _decay_progress)
		pass

func _on_decay_timer_timeout() -> void:
	if _is_decaying:
		return

	_is_decaying = true
	for child in get_children():
		if child is Joint3D:
			child.queue_free()
			
	apply_central_impulse(Vector3.UP * initial_decay_impulse + Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized() * initial_decay_impulse * 0.5)
	set_mode(RigidBody3D.MODE_RIGID)
	_decay_progress = 0.0

func apply_player_kick_off(direction: Vector3, strength: float) -> void:
	if not _is_decaying:
		return
	PhysicsServer3D.body_apply_central_impulse(get_rid(), direction.normalized() * strength)

func connect_to_fragment(other_fragment: RigidBody3D, joint_position: Vector3) -> void:
	var joint = Generic6DOFJoint3D.new()
	add_child(joint)
	joint.set_node_a(get_path())
	joint.set_node_b(other_fragment.get_path())
	joint.global_position = joint_position
	joint.set_param_x(Generic6DOFJoint3D.PARAM_LINEAR_LIMIT_SOFTNESS, 0.5)
	joint.set_param_y(Generic6DOFJoint3D.PARAM_LINEAR_LIMIT_SOFTNESS, 0.5)
	joint.set_param_z(Generic6DOFJoint3D.PARAM_LINEAR_LIMIT_SOFTNESS, 0.5)