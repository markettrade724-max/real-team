extends CharacterBody3D

@export_group("Permeation Settings")
@export var permeation_zone_group_name: String = "PermeationZone"
@export var max_permeation_scale: float = 0.5 # 0.5 means 50% reduction in size
@export var permeation_speed_factor: float = 0.1 # How fast permeation increases with speed
@export var permeation_recovery_speed: float = 0.5 # How fast permeation decreases
@export var permeation_identity_cost_rate: float = 0.01 # Rate of identity loss per second at max permeation

var _original_capsule_radius: float
var _original_capsule_height: float
var _current_permeation_strength: float = 0.0 # 0.0 (no permeation) to 1.0 (max permeation)
var _is_in_permeation_zone: bool = false

var _collision_shape_node: CollisionShape3D
var _capsule_shape: CapsuleShape3D
var _mesh_instance: MeshInstance3D
var _shader_material: ShaderMaterial

signal identity_lost(amount: float)

func _ready():
	_initialize_components()

func _physics_process(delta):
	_update_permeation_state()
	_apply_permeation_effect(delta)
	_update_shader_uniform()
	_apply_identity_cost(delta)

func _initialize_components():
	_collision_shape_node = get_node_or_null("CollisionShape3D")
	if _collision_shape_node and _collision_shape_node.shape is CapsuleShape3D:
		_capsule_shape = _collision_shape_node.shape as CapsuleShape3D
		_original_capsule_radius = _capsule_shape.radius
		_original_capsule_height = _capsule_shape.height
	else:
		push_error("Permeation Stride requires a CapsuleShape3D on a child CollisionShape3D.")
		set_process(false)
		return

	_mesh_instance = get_node_or_null("MeshInstance3D")
	if _mesh_instance and _mesh_instance.mesh and _mesh_instance.get_active_material(0) is ShaderMaterial:
		_shader_material = _mesh_instance.get_active_material(0) as ShaderMaterial
	else:
		push_error("Permeation Stride requires a MeshInstance3D with a ShaderMaterial.")
		set_process(false)

func _update_permeation_state():
	_is_in_permeation_zone = false
	for body in get_overlapping_bodies():
		if body is Area3D and body.is_in_group(permeation_zone_group_name):
			_is_in_permeation_zone = true
			break

func _apply_permeation_effect(delta): 
	var target_permeation_strength: float = 0.0
	if _is_in_permeation_zone and velocity.length() > 0.1: # Only increase if moving
		target_permeation_strength = min(1.0, velocity.length() * permeation_speed_factor)
		_current_permeation_strength = lerp(_current_permeation_strength, target_permeation_strength, delta * 5.0) # Faster increase
	else:
		_current_permeation_strength = lerp(_current_permeation_strength, 0.0, delta * permeation_recovery_speed)

	_current_permeation_strength = clamp(_current_permeation_strength, 0.0, 1.0)

	if _capsule_shape:
		var scale_factor = 1.0 - (_current_permeation_strength * max_permeation_scale)
		_capsule_shape.radius = _original_capsule_radius * scale_factor
		_capsule_shape.height = _original_capsule_height * scale_factor

func _update_shader_uniform():
	if _shader_material:
		_shader_material.set_shader_parameter("permeation_strength", _current_permeation_strength)

func _apply_identity_cost(delta):
	if _current_permeation_strength > 0.01: # Only lose identity if actively permeating
		var cost = permeation_identity_cost_rate * _current_permeation_strength * delta
		emit_signal("identity_lost", cost)
