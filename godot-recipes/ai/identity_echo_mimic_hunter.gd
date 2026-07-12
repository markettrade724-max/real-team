extends CharacterBody3D

const SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float mimic_agility : hint_range(0.0, 1.0) = 0.0;
uniform float mimic_strength : hint_range(0.0, 1.0) = 0.0;
uniform float mimic_resilience : hint_range(0.0, 1.0) = 0.0;
uniform float mimic_intensity : hint_range(0.0, 1.0) = 0.0;

uniform vec4 base_color : source_color = vec4(0.1, 0.1, 0.1, 1.0);
uniform vec4 agility_color : source_color = vec4(0.0, 0.8, 1.0, 1.0); // Cyan
uniform vec4 strength_color : source_color = vec4(1.0, 0.2, 0.0, 1.0); // Red-orange
uniform vec4 resilience_color : source_color = vec4(0.0, 1.0, 0.2, 1.0); // Green

void fragment() {
	vec4 final_color = base_color;

	final_color = mix(final_color, agility_color, mimic_agility * 0.5);
	final_color = mix(final_color, strength_color, mimic_strength * 0.5);
	final_color = mix(final_color, resilience_color, mimic_resilience * 0.5);

	ALBEDO = final_color.rgb;
	EMISSION = final_color.rgb * mimic_intensity * 2.0;
	ALPHA = base_color.a;
}
"""

@export_node_path var target_path: NodePath
@export var movement_speed: float = 5.0
@export var rotation_speed: float = 5.0
@export var attack_range: float = 2.0
@export var attack_cooldown: float = 1.0

@onready var _navigation_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _animation_player: AnimationPlayer = $AnimationPlayer
@onready var _mesh_instance: MeshInstance3D = $MeshInstance3D

var _target: CharacterBody3D
var _current_memory_traits: Dictionary = {}
var _last_attack_time: float = 0.0
var _adapted_speed_multiplier: float = 1.0
var _adapted_attack_strength: float = 1.0
var _adapted_resistance_type: String = ""

enum HunterState { PURSUE, ATTACK, ADAPT }
var _current_state: HunterState = HunterState.PURSUE
var _shader_material: ShaderMaterial

func _ready() -> void:
	_navigation_agent.path_desired_distance = 0.5
	_navigation_agent.target_desired_distance = 0.5
	_navigation_agent.velocity_computed.connect(_on_velocity_computed)
	if target_path:
		_target = get_node(target_path)
	else:
		push_error("Target path not set for Echo-Thief hunter!")
	_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = SHADER_CODE
	_shader_material.shader = shader
	if _mesh_instance and _mesh_instance.mesh:
		_mesh_instance.mesh.surface_set_material(0, _shader_material)

func _physics_process(delta: float) -> void:
	match _current_state:
		HunterState.PURSUE:
			_pursue_target(delta)
		HunterState.ATTACK:
			_attack_target(delta)
		HunterState.ADAPT:
			_current_state = HunterState.PURSUE

func _pursue_target(delta: float) -> void:
	if not is_instance_valid(_target): return
	var target_position = _target.global_transform.origin
	_navigation_agent.target_position = target_position
	if global_transform.origin.distance_to(target_position) <= attack_range:
		_current_state = HunterState.ATTACK
		return
	var next_location = _navigation_agent.get_next_path_position()
	var direction = (next_location - global_transform.origin).normalized()
	velocity = direction * movement_speed * _adapted_speed_multiplier
	move_and_slide()
	_rotate_towards(direction, delta)
	_animation_player.play("run")

func _attack_target(delta: float) -> void:
	if not is_instance_valid(_target):
		_current_state = HunterState.PURSUE
		return
	var target_position = _target.global_transform.origin
	var direction_to_target = (target_position - global_transform.origin).normalized()
	_rotate_towards(direction_to_target, delta)
	if Time.get_ticks_msec() / 1000.0 - _last_attack_time >= attack_cooldown:
		_animation_player.play("attack")
		print("Echo-Thief attacks with strength: ", _adapted_attack_strength)
		_last_attack_time = Time.get_ticks_msec() / 1000.0
	else:
		_animation_player.play("idle")
	if global_transform.origin.distance_to(target_position) > attack_range * 1.2:
		_current_state = HunterState.PURSUE

func _rotate_towards(direction: Vector3, delta: float) -> void:
	var target_angle = atan2(direction.x, direction.z)
	var current_angle = global_transform.basis.get_euler().y
	var angle_diff = wrapf(target_angle - current_angle, -PI, PI)
	var new_angle = current_angle + angle_diff * rotation_speed * delta
	global_transform.basis = Basis.from_euler(Vector3(0, new_angle, 0))

func _on_velocity_computed(safe_velocity: Vector3) -> void:
	pass

func update_memory_fragments(fragments: Dictionary) -> void:
	_current_memory_traits = fragments
	_adapted_speed_multiplier = 1.0
	_adapted_attack_strength = 1.0
	_adapted_resistance_type = ""
	_current_state = HunterState.ADAPT

	if not _shader_material: return

	_shader_material.set_shader_parameter("mimic_agility", 0.0)
	_shader_material.set_shader_parameter("mimic_strength", 0.0)
	_shader_material.set_shader_parameter("mimic_resilience", 0.0)

	if fragments.has("Agility"):
		_adapted_speed_multiplier *= 1.3
		_shader_material.set_shader_parameter("mimic_agility", 1.0)
	if fragments.has("Strength"):
		_adapted_attack_strength *= 1.5
		_shader_material.set_shader_parameter("mimic_strength", 1.0)
	if fragments.has("Resilience"):
		_adapted_resistance_type = "all"
		_shader_material.set_shader_parameter("mimic_resilience", 1.0)

	_shader_material.set_shader_parameter("mimic_intensity", float(fragments.size()) / 3.0)
