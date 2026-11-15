@tool
class_name EchoKineticSuture
extends CharacterBody3D

signal memory_lost(fragment_node)
signal memory_sutured(fragment_node)

@export_range(1.0, 60.0, 0.1) var decay_duration: float = 10.0
@export var decay_velocity_strength: float = 0.5
@export var decay_angular_velocity_strength: float = 0.5
@export var suture_threshold: float = 0.1 # How low decay_strength needs to be to be considered sutured

var _decay_strength: float = 0.0:
	set(value):
		_decay_strength = clampf(value, 0.0, 1.0)
		_update_visual_decay()
		if _decay_strength >= 1.0 and not _is_decay_complete:
			_is_decay_complete = true
			memory_lost.emit(self)
		elif _decay_strength <= suture_threshold and not _is_sutured:
			_is_sutured = true
			memory_sutured.emit(self)

var _is_decay_complete: bool = false
var _is_sutured: bool = false
var _decay_tween: Tween
var _mesh_instance: MeshInstance3D
var _shader_material: ShaderMaterial

func _ready() -> void:
	_mesh_instance = find_child("MeshInstance3D")
	if _mesh_instance:
		var current_material = _mesh_instance.get_active_material(0)
		if current_material is ShaderMaterial:
			_shader_material = current_material
		else:
			_shader_material = ShaderMaterial.new()
			var shader = Shader.new()
			shader.code = _get_default_shader_code()
			_shader_material.shader = shader
			_mesh_instance.set_surface_override_material(0, _shader_material)
	else:
		push_warning("EchoKineticSuture: No MeshInstance3D found as child. Visual decay will not work.")

	if not Engine.is_editor_hint():
		start_decay()

func _physics_process(delta: float) -> void:
	if _is_decay_complete or _is_sutured:
		return

	# Apply decay-induced movement
	var decay_force: Vector3 = (Vector3.UP * 0.1 + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)).normalized() * 0.05) * _decay_strength * decay_velocity_strength
	velocity += decay_force * delta
	
	# Apply decay-induced rotation (angular velocity simulation for CharacterBody3D)
	var decay_torque: Vector3 = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)).normalized() * _decay_strength * decay_angular_velocity_strength
	rotate_object_local(decay_torque.normalized(), decay_torque.length() * delta)

	move_and_slide()

func start_decay() -> void:
	if _is_decay_complete or _is_sutured:
		return

	_is_decay_complete = false
	_is_sutured = false
	_decay_strength = 0.0

	if _decay_tween:
		_decay_tween.kill()

	_decay_tween = create_tween()
	_decay_tween.set_parallel(true)
	_decay_tween.tween_property(self, "_decay_strength", 1.0, decay_duration).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_LINEAR)

func stabilize(suture_amount: float, suture_direction: Vector3 = Vector3.ZERO) -> void:
	if _is_decay_complete or _is_sutured:
		return

	_decay_strength -= suture_amount
	
	# Counteract decay velocity or apply Lyra's push
	if suture_direction != Vector3.ZERO:
		# Push against the fragment, or absorb its momentum
		velocity = velocity.lerp(-suture_direction * suture_amount * 5.0, 0.5)
	else:
		# Just dampen existing velocity
		velocity = velocity.lerp(Vector3.ZERO, suture_amount * 0.5)

	if _decay_strength <= suture_threshold:
		_decay_strength = 0.0
		_is_sutured = true
		if _decay_tween:
			_decay_tween.kill()
		memory_sutured.emit(self)

func _update_visual_decay() -> void:
	if _shader_material:
		_shader_material.set_shader_parameter("dissolve_amount", _decay_strength)
		_shader_material.set_shader_parameter("alpha_fade", 1.0 - _decay_strength)

func _get_default_shader_code() -> String:
	return """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform float alpha_fade : hint_range(0.0, 1.0) = 1.0;
uniform sampler2D texture_albedo : hint_albedo;
uniform vec4 albedo : source_color = vec4(1.0);

void fragment() {
	vec4 albedo_tex = texture(texture_albedo, UV);
	ALBEDO = albedo.rgb * albedo_tex.rgb;
	
	float dissolve_pattern = UV.y + UV.x * 0.5;
	
	if (dissolve_pattern < dissolve_amount) {
		discard;
	}
	
	ALPHA = albedo.a * albedo_tex.a * alpha_fade;
}
"""
