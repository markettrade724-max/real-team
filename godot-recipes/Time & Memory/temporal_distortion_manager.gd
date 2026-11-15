extends Node

signal memory_coherence_changed(new_coherence: float)

@export_range(0.0, 1.0, 0.01) var memory_coherence: float = 1.0:
	set(value):
		var old_value = memory_coherence
		memory_coherence = clampf(value, 0.0, 1.0)
		if memory_coherence != old_value:
			memory_coherence_changed.emit(memory_coherence)

@export var coherence_decay_rate: float = 0.02 # Coherence lost per second
@export var coherence_boost_amount: float = 0.2 # Amount gained per shard
@export_range(0.0, 1.0, 0.01) var min_time_scale: float = 0.1 # Minimum effective time scale
@export_range(0.0, 1.0, 0.01) var max_distortion_strength: float = 0.8 # Max shader distortion

var global_shader_material: ShaderMaterial # Reference to a global post-process shader material

func _ready() -> void:
	# This manager is intended to be an autoload singleton for easy access.
	# The global_shader_material should be assigned in the editor or via code
	# after the scene is ready, typically from a CanvasLayer's ColorRect material.
	pass

func _process(delta: float) -> void:
	decay_coherence(delta)
	update_global_shader()

func decay_coherence(delta_time: float) -> void:
	memory_coherence -= coherence_decay_rate * delta_time

func boost_coherence(amount: float = -1.0) -> void:
	if amount < 0:
		amount = coherence_boost_amount
	memory_coherence += amount

func get_time_scale_factor() -> float:
	# Linearly interpolate between min_time_scale and 1.0 based on coherence
	return lerpf(min_time_scale, 1.0, memory_coherence)

func get_distortion_strength() -> float:
	# Inverse of coherence, scaled by max_distortion_strength
	return lerpf(max_distortion_strength, 0.0, memory_coherence)

func update_global_shader() -> void:
	# Assumes a global post-process shader is applied to a CanvasLayer's ColorRect.
	# The shader material needs to be assigned to 'global_shader_material' property.
	if global_shader_material:
		global_shader_material.set_shader_parameter("memory_coherence", memory_coherence)
		global_shader_material.set_shader_parameter("distortion_strength", get_distortion_strength())
		global_shader_material.set_shader_parameter("time_elapsed", Engine.get_main_loop().get_process_uptime())
