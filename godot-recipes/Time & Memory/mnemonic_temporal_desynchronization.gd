extends Node

@export_range(0.0, 1.0, 0.01) var initial_stability: float = 0.7:
	set(value):
		initial_stability = clampf(value, 0.0, 1.0)
		_temporal_stability = initial_stability
		_update_effects()
@export_range(0.1, 5.0, 0.1) var min_speed_multiplier: float = 0.5 # When stability is 1.0
@export_range(0.1, 5.0, 0.1) var max_speed_multiplier: float = 2.0 # When stability is 0.0
@export var enemy_group_name: String = "Hunters"
@export_file("*.gdshader") var shader_path: String = "res://temporal_distortion.gdshader"
@export_range(0.0, 1.0, 0.01) var shader_distortion_intensity: float = 0.5
@export_range(0.0, 0.01, 0.0001) var shader_chromatic_aberration_strength: float = 0.005

var _temporal_stability: float = 0.0
var _current_speed_multiplier: float = 1.0
var _fullscreen_quad: ColorRect

func _ready() -> void:
	_temporal_stability = initial_stability
	_setup_fullscreen_quad()
	_update_effects()

func _setup_fullscreen_quad() -> void:
	_fullscreen_quad = ColorRect.new()
	_fullscreen_quad.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fullscreen_quad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fullscreen_quad.set_process_mode(Node.PROCESS_MODE_ALWAYS)
	add_child(_fullscreen_quad)

	if not shader_path.is_empty() and FileAccess.file_exists(shader_path):
		var shader_resource = load(shader_path)
		if shader_resource is Shader:
			var material = ShaderMaterial.new()
			material.shader = shader_resource
			_fullscreen_quad.material = material
		else:
			push_error("Failed to load shader resource from path: ", shader_path)
	else:
		push_error("Shader path is empty or file does not exist: ", shader_path)

func _update_effects() -> void:
	_current_speed_multiplier = lerpf(max_speed_multiplier, min_speed_multiplier, _temporal_stability)
	
	_update_enemy_speeds()
	_update_shader_uniforms()

func _update_enemy_speeds() -> void:
	for enemy in get_tree().get_nodes_in_group(enemy_group_name):
		# For enemies that use _physics_process or _process for movement,
		# they would need to accept a scaled delta from this manager.
		# Example: enemy.move_and_slide(velocity * _current_speed_multiplier * delta)
		# Or, if they have a method: enemy.set_temporal_speed_multiplier(_current_speed_multiplier)
		
		for child in enemy.get_children():
			if child is AnimationPlayer:
				child.speed_scale = _current_speed_multiplier
			if child is Tween:
				child.speed_scale = _current_speed_multiplier

func _update_shader_uniforms() -> void:
	if _fullscreen_quad and _fullscreen_quad.material is ShaderMaterial:
		var material = _fullscreen_quad.material as ShaderMaterial
		material.set_shader_parameter("time_multiplier", _current_speed_multiplier)
		material.set_shader_parameter("distortion_intensity", shader_distortion_intensity)
		material.set_shader_parameter("chromatic_aberration_strength", shader_chromatic_aberration_strength)

func increase_stability(amount: float) -> void:
	_temporal_stability = clampf(_temporal_stability + amount, 0.0, 1.0)
	_update_effects()

func decrease_stability(amount: float) -> void:
	_temporal_stability = clampf(_temporal_stability - amount, 0.0, 1.0)
	_update_effects()
