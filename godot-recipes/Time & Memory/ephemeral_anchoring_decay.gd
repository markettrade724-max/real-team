extends Node3D

# GLSL Shader Code for environmental decay
const DECAY_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D texture_albedo : source_color;
uniform vec4 albedo : source_color;
uniform float roughness : hint_range(0,1);
uniform float metallic : hint_range(0,1);
uniform float specular : hint_range(0,1);
uniform float emission_energy : hint_range(0, 10);

uniform float time;
uniform float decay_intensity : hint_range(0.0, 1.0);
uniform sampler2D noise_texture; // Perlin noise for displacement
uniform sampler2D void_texture;  // Mask for alpha blending to void

void vertex() {
	float noise_val = texture(noise_texture, UV * 2.0 + vec2(time * 0.1, time * 0.05)).r;
	float displacement_strength = decay_intensity * 0.5;
	vec3 displacement = NORMAL * noise_val * displacement_strength;
	VERTEX += displacement;
}

void fragment() {
	vec4 albedo_tex = texture(texture_albedo, UV);
	ALBEDO = albedo.rgb * albedo_tex.rgb;

	float void_mask = texture(void_texture, UV).r;
	float final_alpha = 1.0 - (decay_intensity * void_mask);

	ALPHA = final_alpha;
	ALPHA_SCISSOR_THRESHOLD = 0.1;

	ROUGHNESS = roughness;
	METALLIC = metallic;
	SPECULAR = specular;
	EMISSION = albedo.rgb * emission_energy * (1.0 - final_alpha); // Emit light from decaying parts
}
"""

@export var decay_rate: float = 0.01 # How fast decay_intensity increases per second
@export var initial_decay_intensity: float = 0.0
@export var max_decay_intensity: float = 1.0
@export var collision_decay_thresholds: Array[float] = [0.3, 0.6, 0.9] # When to modify collisions
@export var target_environment_path: NodePath # Path to a parent node containing all decayable environment parts

var _global_decay_intensity: float = 0.0
var _decay_shader_material: ShaderMaterial
var _decayable_meshes: Array[MeshInstance3D] = []
var _passed_thresholds: Array[float] = []

func _ready():
	_global_decay_intensity = initial_decay_intensity
	_decay_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = DECAY_SHADER_CODE
	_decay_shader_material.shader = shader
	_decay_shader_material.set_shader_parameter("noise_texture", preload("res://textures/perlin_noise.png"))
	_decay_shader_material.set_shader_parameter("void_texture", preload("res://textures/void_mask.png"))

	if target_environment_path:
		var env_root = get_node(target_environment_path)
		if env_root:
			_find_decayable_meshes(env_root)
			_apply_shader_to_meshes()

func _process(delta: float):
	_global_decay_intensity = min(max_decay_intensity, _global_decay_intensity + decay_rate * delta)
	_decay_shader_material.set_shader_parameter("time", Time.get_ticks_msec() / 1000.0)
	_decay_shader_material.set_shader_parameter("decay_intensity", _global_decay_intensity)
	_check_and_modify_collisions()

func trigger_memory_fragment_decay(intensity_boost: float):
	_global_decay_intensity = min(max_decay_intensity, _global_decay_intensity + intensity_boost)

func _find_decayable_meshes(parent_node: Node):
	for child in parent_node.get_children():
		if child is MeshInstance3D:
			_decayable_meshes.append(child)
		_find_decayable_meshes(child)

func _apply_shader_to_meshes():
	for mesh_node in _decayable_meshes:
		if mesh_node.mesh:
			mesh_node.set_surface_override_material(0, _decay_shader_material)

func _check_and_modify_collisions():
	for threshold in collision_decay_thresholds:
		if _global_decay_intensity >= threshold and not _is_threshold_passed(threshold):
			_pass_threshold(threshold)
			_modify_collisions_for_threshold(threshold)
			break

func _is_threshold_passed(threshold: float) -> bool:
	return threshold in _passed_thresholds

func _pass_threshold(threshold: float):
	_passed_thresholds.append(threshold)

func _modify_collisions_for_threshold(threshold: float):
	for mesh_node in _decayable_meshes:
		var parent_body = mesh_node.get_parent()
		for child_collision in parent_body.get_children():
			if child_collision is CollisionShape3D:
				if threshold == collision_decay_thresholds[0]: # First threshold: shrink
					if child_collision.shape is BoxShape3D:
						var box_shape = child_collision.shape as BoxShape3D
						box_shape.size *= 0.8
				elif threshold == collision_decay_thresholds[1]: # Second threshold: disable
					child_collision.set_deferred("disabled", true)
				elif threshold == collision_decay_thresholds[2]: # Third threshold: replace with RigidBody3D
					if parent_body is StaticBody3D:
						var static_body = parent_body as StaticBody3D
						var rigid_body = RigidBody3D.new()
						rigid_body.transform = static_body.global_transform
						rigid_body.mass = 1.0
						static_body.get_parent().add_child(rigid_body)
						# Move mesh and collision shape to the new rigid body
						static_body.remove_child(mesh_node)
						static_body.remove_child(child_collision)
						rigid_body.add_child(mesh_node)
						rigid_body.add_child(child_collision)
						child_collision.set_deferred("disabled", false) # Re-enable for rigid body
						static_body.queue_free()
						break # Only one collision shape per mesh_node's parent for simplicity
