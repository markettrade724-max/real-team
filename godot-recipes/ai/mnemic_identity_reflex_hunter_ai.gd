extends CharacterBody3D

# Signals
signal hunter_adapted_environment(adaptation_type, target_position)

# Exported properties
@export_category("Hunter Settings")
@export var move_speed: float = 5.0
@export var acceleration: float = 10.0
@export var rotation_speed: float = 5.0
@export var attack_range: float = 2.0
@export var attack_cooldown: float = 1.5

@export_category("Adaptation Weights")
@export var spatial_memory_loss_weight: float = 0.7 # Conceptual weight for adaptation logic
@export var kinetic_memory_loss_weight: float = 0.5 # Conceptual weight for adaptation logic
@export var shield_memory_active_weight: float = 0.3 # Conceptual weight for adaptation logic

# Internal state
var _player_node: Node3D
var _lyra_identity_profile: Dictionary = {
	"lost_memories": [], # e.g., ["spatial_navigation", "kinetic_flux_ability"]
	"active_fragments": [], # e.g., ["shield_memory", "dash_memory"]
	"dominant_emotion": "" # e.g., "grief", "fear", "resolve"
}
var _time_since_last_attack: float = 0.0
var _current_target_position: Vector3
var _is_adapting_environment: bool = false

# Constants
const GRAVITY: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready() -> void:
	_player_node = get_tree().get_first_node_in_group("player")
	if not _player_node:
		push_error("Player node not found in 'player' group! Hunter AI disabled.")
		set_process(false)
		set_physics_process(false)
		return

	if _player_node.has_signal("identity_profile_updated"):
		_player_node.identity_profile_updated.connect(_on_player_identity_profile_updated)
	else:
		push_warning("Player does not emit 'identity_profile_updated' signal. Hunter will not adapt based on identity.")

func _physics_process(delta: float) -> void:
	_time_since_last_attack += delta
	_update_target_position()
	_apply_gravity(delta)
	_adapt_behavior()
	_move_and_attack(delta)

func _update_target_position() -> void:
	if _player_node:
		_current_target_position = _player_node.global_position
	else:
		_current_target_position = global_position # Stay put if no player

func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta

func _on_player_identity_profile_updated(profile: Dictionary) -> void:
	_lyra_identity_profile = profile

func _adapt_behavior() -> void:
	var lost_memories: Array = _lyra_identity_profile.get("lost_memories", [])
	var active_fragments: Array = _lyra_identity_profile.get("active_fragments", [])
	var dominant_emotion: String = _lyra_identity_profile.get("dominant_emotion", "")

	# Environmental Adaptation (Procedural Generation Trigger)
	if "spatial_navigation" in lost_memories and not _is_adapting_environment:
		_trigger_environmental_adaptation("labyrinth", _current_target_position)
		_is_adapting_environment = true # Prevent spamming
	elif "spatial_navigation" not in lost_memories:
		_is_adapting_environment = false # Reset if memory is recovered

	# Movement and Attack Adaptation
	if "kinetic_flux_ability" in lost_memories:
		move_speed = 3.0 # Slow down to match Lyra's perceived weakness
		attack_cooldown = 1.0 # Attack more frequently
	elif "shield_memory" in active_fragments:
		move_speed = 7.0 # Increase speed to flank
	else:
		move_speed = 5.0 # Default behavior
		attack_cooldown = 1.5

	# Emotional adaptation (e.g., visual/audio cues, not just AI behavior)
	if dominant_emotion == "grief":
		pass # Placeholder for visual/audio manifestation as a distorted echo

func _move_and_attack(delta: float) -> void:
	var direction: Vector3 = (_current_target_position - global_position).normalized()
	direction.y = 0 # Keep movement horizontal

	# Rotate towards target
	var target_angle: float = atan2(direction.x, direction.z)
	var current_angle: float = global_rotation.y
	var angle_diff: float = wrapf(target_angle - current_angle, -PI, PI)
	global_rotation.y += angle_diff * rotation_speed * delta

	# Apply movement
	var desired_velocity: Vector3 = direction * move_speed
	velocity.x = lerp(velocity.x, desired_velocity.x, acceleration * delta)
	velocity.z = lerp(velocity.z, desired_velocity.z, acceleration * delta)

	move_and_slide()

	# Attack logic
	if global_position.distance_to(_current_target_position) < attack_range and _time_since_last_attack >= attack_cooldown:
		_perform_attack()
		_time_since_last_attack = 0.0

func _perform_attack() -> void:
	# Implement actual damage, animation, or effect here
	pass

func _trigger_environmental_adaptation(adaptation_type: String, position: Vector3) -> void:
	hunter_adapted_environment.emit(adaptation_type, position)
