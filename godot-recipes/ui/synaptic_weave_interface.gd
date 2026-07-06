extends Control

@export var trace_path_data: PackedVector2Array = PackedVector2Array([Vector2(50, 50), Vector2(150, 50), Vector2(150, 150), Vector2(50, 150), Vector2(50, 50)])
@export var trace_tolerance: float = 10.0
@export var reconstruction_duration: float = 5.0
@export var progress_loss_on_hit: float = 0.1
@export var progress_decay_rate: float = 0.2 # % of reconstruction_duration per second

var _is_active: bool = false
var _reconstruction_progress: float = 0.0
var _current_trace_point_idx: int = 0
var _is_mouse_on_path: bool = false

signal memory_reconstructed(memory_id: String)
signal memory_shattered(memory_id: String)

var _memory_id: String = ""
var _target_shader_material: ShaderMaterial = null

func _ready() -> void:
	set_process(false)
	set_process_input(false)
	var line_node = Line2D.new()
	line_node.name = "TargetTraceLine"
	add_child(line_node)
	line_node.width = 3.0
	line_node.default_color = Color(0.0, 1.0, 1.0, 0.3)
	line_node.points = trace_path_data
	line_node.visible = false

func activate_weave(memory_id_str: String, shader_mat: ShaderMaterial) -> void:
	_memory_id = memory_id_str
	_target_shader_material = shader_mat
	_is_active = true
	_reconstruction_progress = 0.0
	_current_trace_point_idx = 0
	_is_mouse_on_path = false
	set_process(true)
	set_process_input(true)
	get_node("TargetTraceLine").visible = true
	update_shader_fragmentation()
	print("Synaptic Weave activated for memory: ", _memory_id)

func deactivate_weave() -> void:
	_is_active = false
	set_process(false)
	set_process_input(false)
	get_node("TargetTraceLine").visible = false
	print("Synaptic Weave deactivated.")

func _input(event: InputEvent) -> void:
	if not _is_active or not get_global_rect().has_point(get_global_mouse_position()):
		_is_mouse_on_path = false
		return

	if event is InputEventMouseMotion:
		var mouse_pos = get_local_mouse_position()
		if _current_trace_point_idx < trace_path_data.size():
			var target_point = trace_path_data[_current_trace_point_idx]
			if mouse_pos.distance_to(target_point) < trace_tolerance:
				_is_mouse_on_path = true
				_current_trace_point_idx += 1
				if _current_trace_point_idx >= trace_path_data.size():
					_current_trace_point_idx = 0
			else:
				_is_mouse_on_path = false
		else:
			_is_mouse_on_path = false

func _process(delta: float) -> void:
	if not _is_active:
		return

	if _is_mouse_on_path:
		_reconstruction_progress = min(1.0, _reconstruction_progress + delta / reconstruction_duration)
	else:
		_reconstruction_progress = max(0.0, _reconstruction_progress - delta * progress_decay_rate)

	update_shader_fragmentation()

	if _reconstruction_progress >= 1.0:
		emit_signal("memory_reconstructed", _memory_id)
		deactivate_weave()
	elif _reconstruction_progress <= 0.0:
		emit_signal("memory_shattered", _memory_id)
		deactivate_weave()

func apply_weave_damage(damage_amount: float) -> void:
	if not _is_active:
		return
	_reconstruction_progress = max(0.0, _reconstruction_progress - damage_amount * progress_loss_on_hit)
	update_shader_fragmentation()
	print("Weave damaged! Progress: ", _reconstruction_progress)
	# Check for shattering immediately after damage
	if _reconstruction_progress <= 0.0:
		emit_signal("memory_shattered", _memory_id)
		deactivate_weave()

func update_shader_fragmentation() -> void:
	if _target_shader_material:
		_target_shader_material.set_shader_parameter("fragmentation_amount", 1.0 - _reconstruction_progress)
