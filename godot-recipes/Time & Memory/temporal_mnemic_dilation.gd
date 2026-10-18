extends Node

@export_range(0.01, 0.99, 0.01) var slow_time_scale: float = 0.2
@export_range(0.5, 5.0, 0.1) var slow_duration: float = 2.0
@export_range(0.1, 1.0, 0.05) var time_scale_tween_speed: float = 0.3
@export_range(0.1, 3.0, 0.1) var memory_fade_duration: float = 1.0

var _time_scale_tween: Tween = null

func _ready() -> void:
	Engine.time_scale = 1.0

func activate_pulse(memory_fragment: CanvasItem) -> void:
	if _time_scale_tween and _time_scale_tween.is_running():
		_time_scale_tween.kill()
	
	_time_scale_tween = create_tween()
	_time_scale_tween.tween_property(Engine, "time_scale", slow_time_scale, time_scale_tween_speed).set_ease(Tween.EASE_OUT)
	_time_scale_tween.tween_interval(slow_duration)
	_time_scale_tween.tween_property(Engine, "time_scale", 1.0, time_scale_tween_speed).set_ease(Tween.EASE_IN)
	_time_scale_tween.finished.connect(_on_time_scale_tween_finished)
	
	if memory_fragment and memory_fragment.material is ShaderMaterial:
		var shader_material: ShaderMaterial = memory_fragment.material
		if shader_material.shader and shader_material.shader.resource_path.ends_with("memory_degrade.gdshader"):
			var memory_tween = create_tween()
			memory_tween.tween_property(shader_material, "shader_parameter/degrade_amount", 1.0, memory_fade_duration).set_ease(Tween.EASE_IN_OUT)
			memory_tween.finished.connect(func():
				if is_instance_valid(memory_fragment):
					memory_fragment.queue_free()
			)
		else:
			push_warning("Memory fragment material is not using 'memory_degrade.gdshader'. Degradation will not be visual.")
	else:
		push_warning("Memory fragment provided is not a CanvasItem with a ShaderMaterial.")

func _on_time_scale_tween_finished() -> void:
	_time_scale_tween = null
	Engine.time_scale = 1.0

func _exit_tree() -> void:
	Engine.time_scale = 1.0