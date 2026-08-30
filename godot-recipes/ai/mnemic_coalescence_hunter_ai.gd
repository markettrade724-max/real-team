extends CharacterBody3D

class_name MnemicCoalescenceHunterAI

@export var move_speed: float = 5.0
@export var assimilation_range: float = 2.0

var _target_memory: Node3D = null
var _assimilated_memories: Array[Resource] = []
var _current_ability_type: String = "none"

@onready var _detection_area: Area3D = $"DetectionArea"
@onready var _mesh_instance: MeshInstance3D = $"MeshInstance3D"
@onready var _shader_material: ShaderMaterial = _mesh_instance.get_active_material(0) as ShaderMaterial

func _ready() -> void:
	_detection_area.body_entered.connect(_on_detection_area_body_entered)
	_detection_area.body_exited.connect(_on_detection_area_body_exited)
	_update_shader_parameters()

func _physics_process(delta: float) -> void:
	_seek_and_assimilate(delta)
	_apply_current_ability(delta)

func _seek_and_assimilate(delta: float) -> void:
	if _target_memory and is_instance_valid(_target_memory):
		var direction: Vector3 = (_target_memory.global_position - global_position).normalized()
		velocity = direction * move_speed
		move_and_slide()

		if global_position.distance_to(_target_memory.global_position) < assimilation_range:
			_assimilate_memory_fragment(_target_memory)
			_target_memory = null
	else:
		velocity = Vector3.ZERO
		move_and_slide()

func _assimilate_memory_fragment(memory_node: Node3D) -> void:
	if memory_node.has_method("get_memory_resource"):
		var memory_res: Resource = memory_node.get_memory_resource()
		if memory_res:
			_assimilated_memories.append(memory_res)
			_apply_memory_effects(memory_res)
			_update_shader_parameters()
			memory_node.queue_free()
			print("Assimilated memory: ", memory_res.get("fragment_id", "Unknown"))

func _apply_memory_effects(memory_res: Resource) -> void:
	_current_ability_type = memory_res.get("ability_type", "none")

func _update_shader_parameters() -> void:
	if not _shader_material:
		return

	var avg_color: Color = Color.BLACK
	var total_modifier: float = 0.0

	for mem_res in _assimilated_memories:
		avg_color += mem_res.get("fragment_color", Color.BLACK)
		total_modifier += mem_res.get("defense_modifier", 0.0) + mem_res.get("attack_modifier", 0.0)

	if not _assimilated_memories.is_empty():
		avg_color /= _assimilated_memories.size()

	_shader_material.set_shader_parameter("albedo_color", avg_color)
	_shader_material.set_shader_parameter("emission_strength", total_modifier * 0.05)
	_shader_material.set_shader_parameter("distortion_factor", total_modifier * 0.02)

func _apply_current_ability(delta: float) -> void:
	match _current_ability_type:
		"speed_boost":
			velocity *= 1.1
		"shield":
			pass
		_:
			pass

func _on_detection_area_body_entered(body: Node3D) -> void:
	if body.has_method("get_memory_resource"):
		if not _target_memory or global_position.distance_to(body.global_position) < global_position.distance_to(_target_memory.global_position):
			_target_memory = body

func _on_detection_area_body_exited(body: Node3D) -> void:
	if _target_memory == body:
		_target_memory = null