extends Node

# Global singleton to manage memory erosion and update shaders
# Auto-load this script as a singleton named "MemoryManager"

signal memory_eroded(new_factor)

const OBJECT_SHADER_PATH = "res://shaders/anamnesis_void_object.gdshader"
const POST_PROCESS_SHADER_PATH = "res://shaders/anamnesis_void_post_process.gdshader"

var _global_memory_erosion_factor: float = 0.0:
	set(value):
		_global_memory_erosion_factor = clampf(value, 0.0, 1.0)
		_update_shader_uniforms()
		memory_eroded.emit(_global_memory_erosion_factor)

func _ready() -> void:
	# Ensure shaders are loaded (optional check, but good practice)
	if not ResourceLoader.exists(OBJECT_SHADER_PATH) or not ResourceLoader.exists(POST_PROCESS_SHADER_PATH):
		push_error("MemoryManager: Required shaders not found. Please create them at the specified paths.")
		return

	# Initial update to set the global shader uniform
	_update_shader_uniforms()

func _update_shader_uniforms() -> void:
	# Update the global shader uniform accessible by all shaders
	RenderingServer.global_shader_parameter_set("global_memory_erosion_factor", _global_memory_erosion_factor)

func erode_memory(amount: float) -> void:
	_global_memory_erosion_factor += amount

func restore_memory(amount: float) -> void:
	_global_memory_erosion_factor -= amount

func get_erosion_factor() -> float:
	return _global_memory_erosion_factor
