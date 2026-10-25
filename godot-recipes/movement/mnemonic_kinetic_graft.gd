extends CharacterBody3D

# Base movement parameters
@export_category("Base Movement")
@export var base_speed: float = 5.0
@export var base_jump_velocity: float = 4.5
@export var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

# Current kinetic graft state
var _current_graft_profile: Dictionary = {}
var _graft_duration_timer: float = 0.0

# Dictionary of predefined kinetic profiles
var _kinetic_profiles: Dictionary = {
	"light_glide": {
		"gravity_scale": 0.2,
		"speed_multiplier": 1.5,
		"jump_force_multiplier": 0.0,
		"duration": 3.0,
		"description": "Reduced gravity, increased horizontal speed."
	},
	"heavy_impact": {
		"gravity_scale": 3.0,
		"speed_multiplier": 0.5,
		"jump_force_multiplier": 0.0,
		"duration": 2.0,
		"description": "Increased gravity, reduced speed, becomes unshakable."
	},
	"burst_jump": {
		"gravity_scale": 1.0,
		"speed_multiplier": 1.0,
		"jump_force_multiplier": 2.5,
		"duration": 0.5,
		"description": "Massive vertical boost."
	}
}

func _physics_process(delta: float) -> void:
	_update_graft_timer(delta)
	_apply_movement(delta)

func _update_graft_timer(delta: float) -> void:
	if _graft_duration_timer > 0:
		_graft_duration_timer -= delta
		if _graft_duration_timer <= 0:
			_deactivate_kinetic_graft()

func _apply_movement(delta: float) -> void:
	var current_gravity_scale: float = 1.0
	var current_speed_multiplier: float = 1.0
	var current_jump_force_multiplier: float = 1.0

	if _current_graft_profile.has("gravity_scale"):
		current_gravity_scale = _current_graft_profile["gravity_scale"]
	if _current_graft_profile.has("speed_multiplier"):
		current_speed_multiplier = _current_graft_profile["speed_multiplier"]
	if _current_graft_profile.has("jump_force_multiplier"):
		current_jump_force_multiplier = _current_graft_profile["jump_force_multiplier"]

	# Apply gravity
	if not is_on_floor():
		velocity.y -= gravity * current_gravity_scale * delta

	# Handle jump
	if Input.is_action_just_pressed("jump") and is_on_floor() and current_jump_force_multiplier > 0:
		velocity.y = base_jump_velocity * current_jump_force_multiplier

	# Get the input direction and handle the speed.
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	if direction:
		velocity.x = direction.x * base_speed * current_speed_multiplier
		velocity.z = direction.z * base_speed * current_speed_multiplier
	else:
		velocity.x = move_toward(velocity.x, 0, base_speed * current_speed_multiplier)
		velocity.z = move_toward(velocity.z, 0, base_speed * current_speed_multiplier)

	move_and_slide()

func activate_kinetic_graft(profile_name: String) -> void:
	if _kinetic_profiles.has(profile_name):
		_current_graft_profile = _kinetic_profiles[profile_name]
		_graft_duration_timer = _current_graft_profile.get("duration", 0.0)
	else:
		pass

func _deactivate_kinetic_graft() -> void:
	_current_graft_profile = {}
	_graft_duration_timer = 0.0
