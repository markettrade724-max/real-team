extends CharacterBody3D
class_name MnemonicWeaverAI

@export var movement_speed: float = 5.0
@export var detection_range: float = 20.0
@export var corruption_range: float = 2.0
@export var corruption_time: float = 5.0
@export var absorption_buff_duration: float = 10.0
@export var corruption_shader_resource: ShaderMaterial

var current_target_fragment: RigidBody3D = null
var corruption_timer: float = 0.0
var is_corrupting: bool = false
var original_fragment_material: Material = null

var has_absorption_buff: bool = false
var absorption_buff_timer: float = 0.0
var base_movement_speed: float

func _ready() -> void:
	if not corruption_shader_resource:
		push_error("MnemonicWeaverAI: corruption_shader_resource is not assigned!")
		set_process(false)
		set_physics_process(false)
		return
	base_movement_speed = movement_speed
	_find_nearest_memory_fragment()

func _physics_process(delta: float) -> void:
	_update_buff(delta)
	_handle_target_fragment(delta)
	move_and_slide()

func _update_buff(delta: float) -> void:
	if has_absorption_buff:
		absorption_buff_timer -= delta
		if absorption_buff_timer <= 0.0:
			has_absorption_buff = false
			movement_speed = base_movement_speed

func _handle_target_fragment(delta: float) -> void:
	if not current_target_fragment or not is_instance_valid(current_target_fragment):
		_find_nearest_memory_fragment()
		if not current_target_fragment:
			velocity = Vector3.ZERO
			return

	var target_pos = current_target_fragment.global_transform.origin
	var distance = global_transform.origin.distance_to(target_pos)
	var direction = (target_pos - global_transform.origin).normalized()

	if distance > corruption_range:
		velocity = direction * movement_speed
		is_corrupting = false
		corruption_timer = 0.0
	else:
		velocity = Vector3.ZERO
		if not is_corrupting:
			_start_corruption()
		_update_corruption(delta)

func _find_nearest_memory_fragment() -> void:
	var closest_fragment: RigidBody3D = null
	var min_distance: float = detection_range + 1.0

	for node in get_tree().get_nodes_in_group("memory_fragments"):
		if node is RigidBody3D and not node.has_meta("is_corrupted"):
			var distance = global_transform.origin.distance_to(node.global_transform.origin)
			if distance < min_distance:
				min_distance = distance
				closest_fragment = node
	current_target_fragment = closest_fragment

func _start_corruption() -> void:
	is_corrupting = true
	current_target_fragment.set_meta("is_corrupted", true)
	var mesh_instance = current_target_fragment.get_node_or_null("MeshInstance3D")
	if mesh_instance and mesh_instance is MeshInstance3D:
		original_fragment_material = mesh_instance.get_surface_override_material(0)
		mesh_instance.set_surface_override_material(0, corruption_shader_resource)
		corruption_shader_resource.set_shader_parameter("corruption_progress", 0.0)

func _update_corruption(delta: float) -> void:
	if not current_target_fragment or not is_corrupting: return

	corruption_timer += delta
	var progress = min(corruption_timer / corruption_time, 1.0)

	var mesh_instance = current_target_fragment.get_node_or_null("MeshInstance3D")
	if mesh_instance and mesh_instance is MeshInstance3D:
		var current_material = mesh_instance.get_surface_override_material(0)
		if current_material is ShaderMaterial:
			current_material.set_shader_parameter("corruption_progress", progress)

	if corruption_timer >= corruption_time:
		_absorb_fragment()
		current_target_fragment = null
		is_corrupting = false
		corruption_timer = 0.0

func _absorb_fragment() -> void:
	_apply_absorption_buff()
	_generate_memory_obstacle()
	current_target_fragment.queue_free()

func _apply_absorption_buff() -> void:
	has_absorption_buff = true
	absorption_buff_timer = absorption_buff_duration
	movement_speed = base_movement_speed * 1.5

func _generate_memory_obstacle() -> void:
	var obstacle_mesh_instance = current_target_fragment.get_node_or_null("MeshInstance3D")
	if not obstacle_mesh_instance or not obstacle_mesh_instance is MeshInstance3D: return

	var static_body = StaticBody3D.new()
	static_body.global_transform = current_target_fragment.global_transform
	get_parent().add_child(static_body)

	var mesh_copy = MeshInstance3D.new()
	mesh_copy.mesh = obstacle_mesh_instance.mesh
	mesh_copy.material_override = corruption_shader_resource.duplicate()
	(mesh_copy.material_override as ShaderMaterial).set_shader_parameter("corruption_progress", 1.0)
	static_body.add_child(mesh_copy)

	var collision_shape = CollisionShape3D.new()
	if mesh_copy.mesh:
		collision_shape.shape = mesh_copy.mesh.create_trimesh_shape()
	static_body.add_child(collision_shape)

const CORRUPTION_SHADER_GLSL = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float corruption_progress : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D texture_albedo : source_color;
uniform vec4 albedo : source_color = vec4(1.0);
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float roughness : hint_range(0.0, 1.0) = 1.0;
uniform sampler2D texture_metallic : hint_default_white;
uniform sampler2D texture_roughness : hint_default_white;
uniform vec3 corruption_color : source_color = vec3(0.8, 0.1, 0.0);

void fragment() {
	vec2 base_uv = UV;
	vec4 albedo_tex = texture(texture_albedo, base_uv);
	ALBEDO = albedo.rgb * albedo_tex.rgb;

	ALBEDO = mix(ALBEDO, corruption_color, corruption_progress);

	METALLIC = metallic * texture(texture_metallic, base_uv).r;
	ROUGHNESS = roughness * texture(texture_roughness, base_uv).g;
}
"""
