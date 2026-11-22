extends Node

# Dictionary to store Lyra's memory coherence profile.
# Key: memory_id (String), Value: Dictionary { "status": "present"|"lost"|"targeted", "tags": PackedStringArray }
var memory_profile: Dictionary = {}

# Dictionary mapping semantic tags to environmental effect resources.
# Key: semantic_tag (String), Value: Array of resources/paths (PackedScene, ShaderMaterial)
var environmental_effects_map: Dictionary = {}

# Reference to the root of the environment where changes will occur.
@export var environment_root: Node3D

# Placeholder for a generic "claustrophobic tunnel" module.
# Create a simple scene (e.g., a BoxMesh) at res://scenes/claustrophobic_tunnel.tscn for testing.
@export var claustrophobic_tunnel_scene: PackedScene = preload("res://scenes/claustrophobic_tunnel.tscn")

# Placeholder for a "dissolving" shader material.
# Create a ShaderMaterial resource (e.g., res://materials/dissolving_memory.tres)
# and assign a new Shader (res://shaders/dissolving_memory.gdshader) to it.
@export var dissolving_shader_material: ShaderMaterial = preload("res://materials/dissolving_memory.tres")

func _ready() -> void:
	# Example: Initialize with some memories
	add_memory("childhood_home", ["belonging", "comfort"])
	add_memory("first_love", ["joy", "trust"])

	# Example: Register effects for semantic tags
	environmental_effects_map["belonging"] = [claustrophobic_tunnel_scene, dissolving_shader_material]
	environmental_effects_map["trust"] = [] # Add more effects as needed

	# Simulate losing a memory after a delay
	get_tree().create_timer(3.0).timeout.connect(func(): lose_memory("childhood_home"))

func add_memory(memory_id: String, tags: PackedStringArray) -> void:
	memory_profile[memory_id] = {"status": "present", "tags": tags}

func lose_memory(memory_id: String) -> void:
	if not memory_profile.has(memory_id):
		return
	memory_profile[memory_id]["status"] = "lost"
	_apply_environmental_transformation(memory_profile[memory_id]["tags"])

func target_memory(memory_id: String) -> void:
	if not memory_profile.has(memory_id):
		return
	memory_profile[memory_id]["status"] = "targeted"
	_apply_environmental_transformation(memory_profile[memory_id]["tags"])

func _apply_environmental_transformation(tags: PackedStringArray) -> void:
	if not is_instance_valid(environment_root):
		return
	for tag in tags:
		if environmental_effects_map.has(tag):
			for effect_resource in environmental_effects_map[tag]:
				_trigger_effect(effect_resource)

func _trigger_effect(effect_resource) -> void:
	if effect_resource is PackedScene:
		_instantiate_scene_effect(effect_resource)
	elif effect_resource is ShaderMaterial:
		_apply_shader_effect(effect_resource)

func _instantiate_scene_effect(scene_resource: PackedScene) -> void:
	var new_module: Node3D = scene_resource.instantiate()
	environment_root.add_child(new_module)
	new_module.global_transform.origin = environment_root.global_transform.origin + Vector3(randf_range(-10.0, 10.0), 0.0, randf_range(-10.0, 10.0))

func _apply_shader_effect(shader_mat: ShaderMaterial) -> void:
	# Apply to the first MeshInstance3D child found for demonstration.
	# In a real game, this would target specific meshes or use a global shader parameter.
	for child in environment_root.get_children():
		if child is MeshInstance3D:
			var mesh_instance: MeshInstance3D = child
			mesh_instance.material_override = shader_mat
			return # Apply to one and exit
