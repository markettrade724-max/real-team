extends CharacterBody3D
class_name HunterAI

signal hunter_activated_corrupted_memory(memory_type: String)

@export var base_speed: float = 3.0
@export var memory_effect_database: Dictionary = {
	"courage": {
		"animation": "attack_courage_corrupted",
		"shader_param_name": "corruption_color",
		"shader_param_value": Color(1, 0, 0, 1)
	},
	"loyalty": {
		"animation": "defense_loyalty_corrupted",
		"shader_param_name": "corruption_intensity",
		"shader_param_value": 0.8
	}
}

@onready var _animation_player: AnimationPlayer = $"AnimationPlayer"
@onready var _mesh_instance: MeshInstance3D = $"MeshInstance3D"
@onready var _target_node: Node3D = get_tree().get_first_node_in_group("player")

var _current_corrupted_memory_type: String = ""
var _is_corrupted_active: bool = false

func _ready():
	if not Engine.has_singleton("MemoryManager"):
		printerr("MemoryManager singleton not found. HunterAI cannot subscribe to memory events.")
		set_process(false) # Disable processing if critical dependency is missing
		return
	MemoryManager.memory_recovered.connect(_on_memory_recovered)

	if not _animation_player:
		printerr("AnimationPlayer not found as child of HunterAI!")
	if not _mesh_instance:
		printerr("MeshInstance3D not found as child of HunterAI!")
	elif not _mesh_instance.material_override is ShaderMaterial:
		printerr("MeshInstance3D has no ShaderMaterial override. Corrupted visuals will not apply.")

func _physics_process(delta):
	_hunt_target(delta)

func _hunt_target(delta):
	if not _target_node: return
	var direction = (_target_node.global_transform.origin - global_transform.origin).normalized()
	velocity = direction * base_speed
	move_and_slide()

	var target_look_at = _target_node.global_transform.origin
	target_look_at.y = global_transform.origin.y
	look_at(target_look_at, Vector3.UP)

func _on_memory_recovered(memory_data: Dictionary):
	var memory_type = memory_data.get("type", "unknown")
	if memory_effect_database.has(memory_type):
		var effect = memory_effect_database[memory_type]
		_current_corrupted_memory_type = memory_type
		_is_corrupted_active = true
		_apply_corrupted_behavior(effect)
		emit_signal("hunter_activated_corrupted_memory", memory_type)
		print("Hunter activated corrupted memory: ", memory_type)
	else:
		print("No specific corruption effect defined for memory type: ", memory_type)

func _apply_corrupted_behavior(effect: Dictionary):
	if _animation_player and effect.has("animation"):
		_animation_player.play(effect["animation"])
	if _mesh_instance and _mesh_instance.material_override is ShaderMaterial:
		var shader_material = _mesh_instance.material_override as ShaderMaterial
		if effect.has("shader_param_name") and effect.has("shader_param_value"):
			var param_name = effect["shader_param_name"]
			var param_value = effect["shader_param_value"]
			shader_material.set_shader_parameter(param_name, param_value)
			print("Applied shader parameter: %s = %s" % [param_name, param_value])
