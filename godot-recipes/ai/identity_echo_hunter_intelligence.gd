extends CharacterBody3D

@export var player_node_path: NodePath
@export var movement_speed: float = 5.0
@export var pursuit_range: float = 15.0
@export var attack_range: float = 2.0
@export var attack_cooldown: float = 1.5

var _player: CharacterBody3D
var _nav_agent: NavigationAgent3D
var _time_since_last_attack: float = 0.0
var _hunter_state: String = "IDLE"

var _lyra_identity_profile: Dictionary = {
	"has_precision_aim": true,
	"has_shielding": false,
	"lost_memory_count": 0
}

var _adaptive_speed_multiplier: float = 1.0
var _adaptive_attack_type: String = "basic_melee"
var _adaptive_evasion_chance: float = 0.0
var _adaptive_shader_distortion: float = 0.0

func _ready() -> void:
	_player = get_node_or_null(player_node_path)
	if not _player:
		push_error("Player node not found: ", player_node_path)
		set_process(false)
		return
	_nav_agent = NavigationAgent3D.new()
	add_child(_nav_agent)
	_nav_agent.path_desired_distance = 0.5
	_nav_agent.target_desired_distance = 0.5
	_nav_agent.velocity_computed.connect(_on_velocity_computed)
	_update_hunter_adaptation(_lyra_identity_profile)

func _physics_process(delta: float) -> void:
	if not is_instance_valid(_player): return
	_time_since_last_attack += delta
	var dist = global_position.distance_to(_player.global_position)
	if dist <= attack_range:
		_hunter_state = "ATTACKING"
		_attack_player()
	elif dist <= pursuit_range:
		_hunter_state = "PURSUING"
		_pursue_player()
	else:
		_hunter_state = "IDLE"
		velocity = Vector3.ZERO
	move_and_slide()

func _pursue_player() -> void:
	_nav_agent.target_position = _player.global_position
	var next_point = _nav_agent.get_next_path_position()
	var direction = (next_point - global_position).normalized()
	velocity = direction * movement_speed * _adaptive_speed_multiplier
	if _adaptive_evasion_chance > 0.0 and randf() < _adaptive_evasion_chance * 0.01:
		_evade_attack()

func _attack_player() -> void:
	if _time_since_last_attack >= attack_cooldown:
		print("Hunter attacks with type: ", _adaptive_attack_type)
		_time_since_last_attack = 0.0

func _evade_attack() -> void:
	var evade_dir = Vector3(randf_range(-1.0, 1.0), 0, randf_range(-1.0, 1.0)).normalized()
	velocity += evade_dir * (movement_speed * 2.0)

func _on_velocity_computed(safe_velocity: Vector3) -> void:
	velocity = safe_velocity

func update_lyra_profile(profile: Dictionary) -> void:
	_lyra_identity_profile = profile
	_update_hunter_adaptation(profile)

func _update_hunter_adaptation(profile: Dictionary) -> void:
	_adaptive_speed_multiplier = 1.0
	_adaptive_attack_type = "basic_melee"
	_adaptive_evasion_chance = 0.0
	_adaptive_shader_distortion = 0.0

	if not profile.get("has_precision_aim", true):
		_adaptive_evasion_chance += 0.5
		_adaptive_speed_multiplier += 0.2
		_adaptive_shader_distortion += 0.2

	if profile.get("has_shielding", false):
		_adaptive_attack_type = "shield_pierce"
		_adaptive_shader_distortion += 0.3

	_adaptive_shader_distortion += float(profile.get("lost_memory_count", 0)) * 0.1

	var mesh = get_node_or_null("Mesh")
	if mesh and mesh is MeshInstance3D:
		var mat = mesh.get_active_material(0)
		if mat and mat is ShaderMaterial:
			mat.set_shader_parameter("distortion_amount", _adaptive_shader_distortion)
			mat.set_shader_parameter("color_shift", Vector3(_adaptive_shader_distortion, 0, 0))