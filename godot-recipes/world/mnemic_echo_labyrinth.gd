@tool
extends Node3D

class MemoryState extends Resource:
	@export_range(0.0, 1.0, 0.01) var memory_loss_factor: float = 0.0
	@export var active_memory_id: int = 0 # Example: ID of the memory currently being distorted

const LABYRINTH_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float memory_loss_factor : hint_range(0.0, 1.0) = 0.0;
uniform int active_memory_id = 0; // Example: influences specific distortions
uniform float time_speed : hint_range(0.1, 10.0) = 1.0;

void vertex() {
	// Simple vertex displacement based on memory loss and time
	float displacement_strength = memory_loss_factor * 0.5;
	vec3 displacement = NORMAL * (sin(TIME * time_speed + VERTEX.x * 0.1) * 0.5 + 0.5) * displacement_strength;
	VERTEX += displacement;
}

void fragment() {
	// Base color
	vec3 base_color = vec3(0.6, 0.7, 0.8);

	// Distort color based on memory loss
	vec3 distorted_color = mix(base_color, vec3(0.8, 0.2, 0.1), memory_loss_factor); // Shift towards red/orange
	ALBEDO = distorted_color;

	// Add subtle flickering/noise
	float flicker = sin(TIME * 10.0) * 0.05 + 0.95;
	ALBEDO *= flicker;

	// Add a subtle "ghosting" effect based on memory ID (example)
	if (active_memory_id == 1) { // If a specific memory is active
		ALBEDO = mix(ALBEDO, vec3(0.1, 0.5, 0.8), memory_loss_factor * 0.5); // Shift towards blue
	}
}
"""

@export var memory_state: MemoryState
@export var labyrinth_size: Vector3 = Vector3(50, 20, 50)
@export var wall_thickness: float = 1.0
@export var cell_size: float = 10.0 # Not directly used in this minimal CSG example, but kept for context
@export var fog_density: float = 0.05
@export var light_intensity: float = 1.0

var _csg_combiner: CSGCombiner3D
var _shader_material: ShaderMaterial
var _fog_volume: FogVolume
var _directional_light: DirectionalLight3D

func _ready() -> void:
	_setup_labyrinth_components()
	_generate_labyrinth_structure()
	_setup_environment_effects()
	_update_shader_uniforms()

func _process(delta: float) -> void:
	if Engine.is_editor_hint(): # Update in editor for visual feedback
		_update_shader_uniforms()
	else:
		# In game, memory_state might be updated by game logic
		_update_shader_uniforms()

func _setup_labyrinth_components() -> void:
	# Initialize MemoryState if not set
	if memory_state == null:
		memory_state = MemoryState.new()

	# CSG Combiner for the main structure
	_csg_combiner = CSGCombiner3D.new()
	_csg_combiner.name = "LabyrinthCombiner"
	add_child(_csg_combiner)

	# Shader Material
	_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = LABYRINTH_SHADER_CODE
	_shader_material.shader = shader
	_csg_combiner.material = _shader_material

func _generate_labyrinth_structure() -> void:
	# Simple example: a few intersecting CSG boxes to form a basic maze
	var main_box = CSGBox3D.new()
	main_box.size = labyrinth_size
	main_box.operation = CSGBox3D.OPERATION_UNION
	_csg_combiner.add_child(main_box)

	var corridor_cutter = CSGBox3D.new()
	corridor_cutter.size = Vector3(labyrinth_size.x * 0.8, labyrinth_size.y * 0.8, labyrinth_size.z * 0.2)
	corridor_cutter.position = Vector3(0, 0, labyrinth_size.z * 0.2)
	corridor_cutter.operation = CSGBox3D.OPERATION_SUBTRACTION
	_csg_combiner.add_child(corridor_cutter)

	var another_cutter = CSGBox3D.new()
	another_cutter.size = Vector3(labyrinth_size.x * 0.2, labyrinth_size.y * 0.8, labyrinth_size.z * 0.8)
	another_cutter.position = Vector3(labyrinth_size.x * 0.2, 0, 0)
	another_cutter.operation = CSGBox3D.OPERATION_SUBTRACTION
	_csg_combiner.add_child(another_cutter)

	# MultiMesh for small, repeating details (e.g., floating memory shards)
	var multimesh_instance = MultiMeshInstance3D.new()
	multimesh_instance.name = "MemoryShardMultiMesh"
	var multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.mesh = BoxMesh.new() # Example mesh for shards
	multimesh.instance_count = 10 # Number of shards
	multimesh_instance.multimesh = multimesh
	add_child(multimesh_instance)

	for i in range(multimesh.instance_count):
		var transform = Transform3D()
		transform.origin = Vector3(randf_range(-labyrinth_size.x/2, labyrinth_size.x/2),
							   randf_range(-labyrinth_size.y/2, labyrinth_size.y/2),
							   randf_range(-labyrinth_size.z/2, labyrinth_size.z/2))
		transform = transform.scaled(Vector3(0.5, 0.5, 0.5))
		multimesh.set_instance_transform(i, transform)
		multimesh.set_instance_color(i, Color(1, 1, 1, 0.5)) # Semi-transparent

	multimesh_instance.material_override = _shader_material # Apply the same shader

func _setup_environment_effects() -> void:
	# Fog Volume
	_fog_volume = FogVolume.new()
	_fog_volume.name = "LabyrinthFog"
	_fog_volume.size = labyrinth_size * 1.5 # Larger than labyrinth
	_fog_volume.material = FogMaterial.new()
	_fog_volume.material.density = fog_density
	_fog_volume.material.albedo = Color(0.1, 0.1, 0.15)
	_fog_volume.material.emission = Color(0.05, 0.05, 0.08)
	add_child(_fog_volume)

	# Directional Light
	_directional_light = DirectionalLight3D.new()
	_directional_light.name = "LabyrinthLight"
	_directional_light.light_energy = light_intensity
	_directional_light.light_color = Color(0.8, 0.7, 0.6)
	_directional_light.rotation_degrees = Vector3(45, 45, 0)
	add_child(_directional_light)

func _update_shader_uniforms() -> void:
	if _shader_material and memory_state:
		_shader_material.set_shader_parameter("memory_loss_factor", memory_state.memory_loss_factor)
		_shader_material.set_shader_parameter("active_memory_id", memory_state.active_memory_id)
