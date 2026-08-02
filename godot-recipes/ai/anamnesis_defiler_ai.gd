class_name AnamnesisDefilerAI extends CharacterBody3D

const CORRUPTION_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D original_texture : hint_albedo;
uniform sampler2D noise_texture : hint_normal;
uniform float corruption_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec4 corruption_color : source_color = vec4(0.2, 0.0, 0.3, 1.0);

void fragment() {
	vec2 base_uv = UV;
	vec4 noise_sample = texture(noise_texture, base_uv * 2.0 + TIME * 0.1);
	vec2 distorted_uv = base_uv + (noise_sample.xy - 0.5) * corruption_amount * 0.1;
	vec4 original_color = texture(original_texture, distorted_uv);

	float dissolve_threshold = corruption_amount;
	float noise_val = texture(noise_texture, base_uv * 5.0 + TIME * 0.2).r;

	if (noise_val < dissolve_threshold) {
		ALBEDO = corruption_color.rgb;
		ALPHA = 0.0;
	} else {
		ALBEDO = mix(original_color.rgb, corruption_color.rgb, corruption_amount * 0.5);
		ALPHA = original_color.a * (1.0 - corruption_amount * 0.5);
	}
	EMISSION = corruption_color.rgb * corruption_amount * 0.5;
}
"""

@export var speed: float = 5.0
@export var corruption_range: float = 2.0
@export var corruption_rate: float = 0.5
@export var noise_texture: Texture2D
@export var player_node_path: NodePath

@onready var navigation_agent: NavigationAgent3D = $NavigationAgent3D
@onready var player_node: CharacterBody3D = get_node(player_node_path) as CharacterBody3D

var current_target_mesh: MeshInstance3D = null
var corruption_shader: Shader
var active_corruption_materials: Dictionary = {} # Stores {MeshInstance3D: ShaderMaterial}

func _ready() -> void:
	corruption_shader = Shader.new()
	corruption_shader.code = CORRUPTION_SHADER_CODE

	navigation_agent.path_desired_distance = 0.5
	navigation_agent.target_desired_distance = 0.5

	_update_target()

func _physics_process(delta: float) -> void:
	_update_target()
	_move_towards_target(delta)
	_handle_corruption(delta)

func _update_target() -> void:
	var nearest_uncorrupted_mesh: MeshInstance3D = _find_nearest_uncorrupted_memory_mesh()
	if nearest_uncorrupted_mesh:
		current_target_mesh = nearest_uncorrupted_mesh
		navigation_agent.target_position = current_target_mesh.global_position
	elif player_node:
		current_target_mesh = null
		navigation_agent.target_position = player_node.global_position

func _find_nearest_uncorrupted_memory_mesh() -> MeshInstance3D:
	var nearest_mesh: MeshInstance3D = null
	var min_distance: float = INF

	for node in get_tree().get_nodes_in_group("memory_fragments"):
		if node is MeshInstance3D:
			var mesh_instance: MeshInstance3D = node
			if not mesh_instance.get_meta("is_corrupted", false):
				var distance = global_position.distance_to(mesh_instance.global_position)
				if distance < min_distance:
					min_distance = distance
					nearest_mesh = mesh_instance
	return nearest_mesh

func _move_towards_target(delta: float) -> void:
	if navigation_agent.is_navigation_finished():
		velocity = Vector3.ZERO
		return

	var next_path_position: Vector3 = navigation_agent.get_next_path_position()
	var direction: Vector3 = global_position.direction_to(next_path_position)
	velocity = direction * speed
	move_and_slide()

func _handle_corruption(delta: float) -> void:
	if current_target_mesh and global_position.distance_to(current_target_mesh.global_position) < corruption_range:
		_corrupt_memory_mesh(current_target_mesh, delta)

func _corrupt_memory_mesh(mesh_instance: MeshInstance3D, delta: float) -> void:
	var current_material: ShaderMaterial = active_corruption_materials.get(mesh_instance)
	if not current_material:
		current_material = ShaderMaterial.new()
		current_material.shader = corruption_shader
		var original_material: Material = mesh_instance.get_active_material(0)
		current_material.set_shader_parameter("original_texture", original_material.albedo_texture if original_material and original_material.has_texture("albedo_texture") else null)
		current_material.set_shader_parameter("noise_texture", noise_texture)
		current_material.set_shader_parameter("corruption_amount", 0.0)
		mesh_instance.set_surface_override_material(0, current_material)
		active_corruption_materials[mesh_instance] = current_material
		mesh_instance.set_meta("original_material", original_material) # Store original for potential revert

	var corruption_amount: float = current_material.get_shader_parameter("corruption_amount")
	corruption_amount = min(corruption_amount + corruption_rate * delta, 1.0)
	current_material.set_shader_parameter("corruption_amount", corruption_amount)

	if corruption_amount >= 1.0 and not mesh_instance.get_meta("is_corrupted", false):
		mesh_instance.set_meta("is_corrupted", true)
		mesh_instance.set_meta("negative_effect_id", randi_range(1, 3)) # 1:disorient, 2:blind, 3:slow
		print("Memory fragment fully corrupted: ", mesh_instance.name, " with effect ID: ", mesh_instance.get_meta("negative_effect_id"))
