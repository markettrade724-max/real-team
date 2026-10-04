extends CharacterBody3D

@export_node_path var player_node_path: NodePath
@export var base_albedo_color: Color = Color.WHITE
@export var dissolve_threshold: float = 0.5
@export var noise_texture: Texture2D # Assign a noise texture (e.g., Perlin noise) for dissolve effect

var player_node: Node3D
var current_memory_loss_factor: float = 0.0
var eidolon_material_instance: ShaderMaterial

const MEMORY_FRAGMENT_COUNT: int = 10 # Total possible memory fragments Lyra can have

const EIDOLON_SHADER_CODE: String = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform vec4 albedo_color : source_color;
uniform float memory_dissonance : hint_range(0.0, 1.0) = 0.0;
uniform float dissolve_threshold : hint_range(0.0, 1.0) = 0.5;
uniform sampler2D noise_texture : hint_default_white;

void fragment() {
	ALBEDO = albedo_color.rgb;

	float noise_val = texture(noise_texture, UV * 4.0).r;
	float final_threshold = dissolve_threshold - memory_dissonance;

	if (noise_val < final_threshold) {
		discard;
	}

	if (memory_dissonance > 0.5) {
		ALBEDO = mix(ALBEDO, vec3(1.0, 0.2, 0.0), (memory_dissonance - 0.5) * 2.0);
	}
}
"""

func _ready() -> void:
	_initialize_eidolon()

func _physics_process(delta: float) -> void:
	if not is_instance_valid(player_node):
		return

	_update_memory_state_influence()
	_update_visuals()
	_update_behavior(delta)
	_move_eidolon(delta)

func _initialize_eidolon() -> void:
	player_node = get_node_or_null(player_node_path)
	if not is_instance_valid(player_node):
		push_error("Player node not found at path: %s" % player_node_path)
		set_process(false)
		set_physics_process(false)
		return

	var mesh_instance: MeshInstance3D = get_node_or_null("MeshInstance3D")
	if not is_instance_valid(mesh_instance):
		push_error("Eidolon requires a MeshInstance3D child named 'MeshInstance3D'.")
		set_process(false)
		set_physics_process(false)
		return

	var shader_resource = Shader.new()
	shader_resource.code = EIDOLON_SHADER_CODE
	eidolon_material_instance = ShaderMaterial.new()
	eidolon_material_instance.shader = shader_resource
	eidolon_material_instance.set_shader_parameter("albedo_color", base_albedo_color)
	eidolon_material_instance.set_shader_parameter("dissolve_threshold", dissolve_threshold)
	if noise_texture:
		eidolon_material_instance.set_shader_parameter("noise_texture", noise_texture)
	else:
		push_warning("No noise_texture provided for Eidolon dissolve effect.")

	mesh_instance.set_surface_override_material(0, eidolon_material_instance)

func _update_memory_state_influence() -> void:
	var lost_memories_count: int = 0
	if player_node.has_method("get_lost_memory_count"):
		lost_memories_count = player_node.get_lost_memory_count()
	else:
		# Simulate memory loss for testing if player doesn't have the method
		lost_memories_count = int(sin(Time.get_ticks_msec() / 1000.0) * (MEMORY_FRAGMENT_COUNT / 2.0) + (MEMORY_FRAGMENT_COUNT / 2.0))

	current_memory_loss_factor = float(lost_memories_count) / float(MEMORY_FRAGMENT_COUNT)
	current_memory_loss_factor = clampf(current_memory_loss_factor, 0.0, 1.0)

func _update_visuals() -> void:
	if is_instance_valid(eidolon_material_instance):
		eidolon_material_instance.set_shader_parameter("memory_dissonance", current_memory_loss_factor)

func _update_behavior(delta: float) -> void:
	# Eidolon gets faster and more aggressive with more memory loss
	var base_speed: float = 3.0
	var max_speed_bonus: float = 5.0
	var current_speed: float = base_speed + (max_speed_bonus * current_memory_loss_factor)

	# Placeholder for attack logic:
	# if current_memory_loss_factor > 0.7 and can_attack():
	# 	perform_special_attack()

	# For now, just use speed in movement
	pass

func _move_eidolon(delta: float) -> void:
	var direction: Vector3 = (player_node.global_transform.origin - global_transform.origin).normalized()
	var speed: float = 3.0 + (5.0 * current_memory_loss_factor)
	velocity = direction * speed
	move_and_slide()
