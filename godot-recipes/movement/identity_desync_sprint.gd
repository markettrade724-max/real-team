extends CharacterBody3D

@export var max_desync_level: float = 1.0
@export var desync_gain_rate: float = 0.5
@export var desync_decay_rate: float = 1.0
@export var velocity_threshold: float = 10.0
@export var jitter_intensity: float = 0.1
@export var phasing_layer_to_ignore: int = 1
@export var phasing_toggle_interval: float = 0.1
@export var identity_cost_threshold: float = 0.8
@export var desync_stumble_force: float = 5.0
@export var stumble_duration: float = 0.5

@export var global_environment_material: ShaderMaterial
@export var lyra_mesh_material: ShaderMaterial

var current_desync_level: float = 0.0
var is_in_corrupted_zone: bool = false
var original_collision_mask: int
var phasing_timer: float = 0.0
var is_stumbling: bool = false
var stumble_timer: float = 0.0

signal identity_fragment_cracked

func _ready():
	original_collision_mask = collision_mask
	phasing_timer = phasing_toggle_interval

func _physics_process(delta: float):
	_update_desynchronization(delta)
	_update_visual_feedback()
	_handle_collision_phasing(delta)
	_handle_stumble(delta)
	_check_identity_cost()

func _update_desynchronization(delta: float):
	var current_velocity_magnitude = velocity.length()

	if is_in_corrupted_zone and current_velocity_magnitude > velocity_threshold:
		current_desync_level = min(current_desync_level + desync_gain_rate * delta, max_desync_level)
	else:
		current_desync_level = max(current_desync_level - desync_decay_rate * delta, 0.0)

func get_desync_velocity_modifier() -> Vector3:
	if current_desync_level > 0 and not is_stumbling:
		var jitter_amount = jitter_intensity * current_desync_level
		return Vector3(randf_range(-jitter_amount, jitter_amount), 0, randf_range(-jitter_amount, jitter_amount))
	return Vector3.ZERO

func get_desync_stumble_velocity() -> Vector3:
	if is_stumbling:
		return Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized() * desync_stumble_force
	return Vector3.ZERO

func _update_visual_feedback():
	if global_environment_material:
		global_environment_material.set_shader_parameter("desync_intensity", current_desync_level)
	if lyra_mesh_material:
		lyra_mesh_material.set_shader_parameter("desync_level", current_desync_level)

func _handle_collision_phasing(delta: float):
	if current_desync_level > 0.5:
		phasing_timer -= delta
		if phasing_timer <= 0:
			var layer_bit = 1 << (phasing_layer_to_ignore - 1)
			if (collision_mask & layer_bit) != 0:
				collision_mask = original_collision_mask & ~layer_bit
			else:
				collision_mask = original_collision_mask
			phasing_timer = phasing_toggle_interval
	elif collision_mask != original_collision_mask:
		collision_mask = original_collision_mask

func _check_identity_cost():
	if current_desync_level >= identity_cost_threshold and not is_stumbling:
		if randf() < (current_desync_level - identity_cost_threshold) * 0.5:
			emit_signal("identity_fragment_cracked")
			_start_stumble()
			current_desync_level = 0.0

func _start_stumble():
	is_stumbling = true
	stumble_timer = stumble_duration

func _handle_stumble(delta: float):
	if is_stumbling:
		stumble_timer -= delta
		if stumble_timer <= 0:
			is_stumbling = false

func set_corrupted_zone_status(status: bool):
	is_in_corrupted_zone = status
