extends CharacterBody3D

class_name ChronalResonanceLapse

signal lapse_started(position: Vector3)
signal lapse_ended()

@export_group("Lapse Settings")
@export var lapse_duration: float = 1.5
@export var lapse_speed_multiplier: float = 2.0
@export var vulnerability_multiplier: float = 2.0 # For external systems to react to
@export var lapse_shader_intensity: float = 1.0

@export_group("Node Paths")
@export var mesh_instance_path: NodePath
@export var animation_player_path: NodePath

var _is_lapsing: bool = false
var _mesh_instance: MeshInstance3D
var _animation_player: AnimationPlayer
var _lapse_shader_material: ShaderMaterial # The ShaderMaterial on Lyra's mesh
var _lapse_timer: Timer

func _ready() -> void:
	_mesh_instance = get_node_or_null(mesh_instance_path)
	_animation_player = get_node_or_null(animation_player_path)

	if not _mesh_instance:
		push_error("ChronalResonanceLapse: MeshInstance3D not found at path: ", mesh_instance_path)
		set_process(false)
		set_physics_process(false)
		return
	if not _animation_player:
		push_error("ChronalResonanceLapse: AnimationPlayer not found at path: ", animation_player_path)
		set_process(false)
		set_physics_process(false)
		return

	var current_material = _mesh_instance.get_active_material(0)
	if not current_material is ShaderMaterial:
		push_error("ChronalResonanceLapse: MeshInstance3D's material is not a ShaderMaterial. Please assign a ShaderMaterial with 'chronal_resonance_lapse.gdshader' to the mesh.")
		set_process(false)
		set_physics_process(false)
		return
	_lapse_shader_material = current_material as ShaderMaterial

	_lapse_timer = Timer.new()
	add_child(_lapse_timer)
	_lapse_timer.one_shot = true
	_lapse_timer.timeout.connect(_on_lapse_timer_timeout)

func _physics_process(delta: float) -> void:
	var current_delta = delta
	if _is_lapsing:
		current_delta *= lapse_speed_multiplier
	# IMPORTANT: Integrate Lyra's movement logic here, using 'current_delta'
	# For example:
	# var direction = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	# velocity = (transform.basis * Vector3(direction.x, 0, direction.y)).normalized() * speed * current_delta
	# move_and_slide()
	pass # Placeholder for actual movement logic

func start_lapse() -> void:
	if _is_lapsing:
		return

	_is_lapsing = true
	_lapse_timer.start(lapse_duration)

	if _animation_player:
		_animation_player.speed_scale = lapse_speed_multiplier

	if _lapse_shader_material:
		_lapse_shader_material.set_shader_parameter("lapse_intensity", lapse_shader_intensity)

	lapse_started.emit(global_position)
	# print("Chronal Resonance Lapse started!") # Debug

func _on_lapse_timer_timeout() -> void:
	end_lapse()

func end_lapse() -> void:
	if not _is_lapsing:
		return

	_is_lapsing = false

	if _animation_player:
		_animation_player.speed_scale = 1.0

	if _lapse_shader_material:
		_lapse_shader_material.set_shader_parameter("lapse_intensity", 0.0) # Reset shader effect

	lapse_ended.emit()
	# print("Chronal Resonance Lapse ended.") # Debug

func is_lapsing() -> bool:
	return _is_lapsing
