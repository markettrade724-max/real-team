extends Area3D

@export_category("Echo Field Settings")
@export var echo_duration: float = 1.5 # Duration of the time reversal effect
@export var distortion_strength: float = 0.1 # Passed to shader
@export var distortion_speed: float = 5.0 # Passed to shader
@export var echo_color: Color = Color(0.2, 0.5, 0.8, 0.5) # Passed to shader
@export var memory_loss_debuff_duration: float = 5.0 # How long the debuff lasts

var _affected_objects: Array[Node3D] = []
var _is_active: bool = false
var _shader_material: ShaderMaterial
var _effect_mesh: MeshInstance3D # Visual representation of the field

signal echo_activated
signal echo_deactivated
signal memory_fragment_lost # Emitted when a memory cost is paid
signal debuff_applied # Emitted when a debuff cost is paid

func _ready() -> void:
	# Ensure Area3D has a CollisionShape3D
	if get_node_or_null("CollisionShape3D") == null:
		push_warning("Area3D requires a CollisionShape3D child for detection.")
	
	# Find or create the visual mesh for the effect
	_effect_mesh = get_node_or_null("EchoEffectMesh")
	if _effect_mesh == null:
		_effect_mesh = MeshInstance3D.new()
		_effect_mesh.name = "EchoEffectMesh"
		add_child(_effect_mesh)
		_effect_mesh.mesh = SphereMesh.new() # Default visualizer
		(_effect_mesh.mesh as SphereMesh).radius = 1.0
		(_effect_mesh.mesh as SphereMesh).height = 2.0
		_effect_mesh.set_owner(self) # Make sure it's saved with the scene
	
	_shader_material = ShaderMaterial.new()
	var shader_res = Shader.new()
	shader_res.code = ECHO_FIELD_SHADER_CODE
	_shader_material.shader = shader_res
	_effect_mesh.material_override = _shader_material
	
	# Initial shader parameters
	_shader_material.set_shader_parameter("distortion_strength", distortion_strength)
	_shader_material.set_shader_parameter("distortion_speed", distortion_speed)
	_shader_material.set_shader_parameter("echo_color", echo_color)
	_shader_material.set_shader_parameter("effect_progress", 0.0) # Start inactive
	
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func activate_echo_field() -> void:
	if _is_active:
		return
	
	_is_active = true
	echo_activated.emit()
	
	# Apply shader effect
	_shader_material.set_shader_parameter("effect_progress", 1.0)
	
	# Reverse states of affected objects
	for body in _affected_objects:
		_reverse_object_state(body)
	
	# Apply cost
	_apply_cost()
	
	# Deactivate after duration
	get_tree().create_timer(echo_duration).timeout.connect(deactivate_echo_field)

func deactivate_echo_field() -> void:
	if not _is_active:
		return
	
	_is_active = false
	echo_deactivated.emit()
	
	# Reset shader effect
	_shader_material.set_shader_parameter("effect_progress", 0.0)
	
	# Clear affected objects list for next activation
	_affected_objects.clear()

func _reverse_object_state(body: Node3D) -> void:
	# Attempt to reverse AnimationPlayer
	if body.has_node("AnimationPlayer"):
		var anim_player: AnimationPlayer = body.get_node("AnimationPlayer")
		if anim_player.current_animation != "":
			anim_player.play_backwards(anim_player.current_animation)
			return
	
	# Fallback: Use Tween for basic properties if no AnimationPlayer
	var tween: Tween = get_tree().create_tween()
	tween.set_trans(Tween.TRANS_LINEAR).set_ease(Tween.EASE_IN_OUT)
	
	if body is CharacterBody3D:
		var char_body: CharacterBody3D = body
		char_body.velocity = -char_body.velocity * 0.5 # Halve and reverse velocity
		tween.tween_property(char_body, "velocity", Vector3.ZERO, echo_duration * 0.5)
	elif body is RigidBody3D:
		var rigid_body: RigidBody3D = body
		rigid_body.linear_velocity = -rigid_body.linear_velocity * 0.5
		rigid_body.angular_velocity = -rigid_body.angular_velocity * 0.5
		tween.tween_property(rigid_body, "linear_velocity", Vector3.ZERO, echo_duration * 0.5)
		tween.tween_property(rigid_body, "angular_velocity", Vector3.ZERO, echo_duration * 0.5)

func _apply_cost() -> void:
	memory_fragment_lost.emit()
	print("Echoes of What Was: A memory fragment was lost.")
	
debuff_applied.emit(memory_loss_debuff_duration)
	print("Echoes of What Was: A temporary debuff was applied for %s seconds." % memory_loss_debuff_duration)

func _on_body_entered(body: Node3D) -> void:
	if body != self and not _affected_objects.has(body):
		_affected_objects.append(body)

func _on_body_exited(body: Node3D) -> void:
	if _affected_objects.has(body):
		_affected_objects.erase(body)

const ECHO_FIELD_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float distortion_strength : hint_range(0.0, 1.0) = 0.1;
uniform float distortion_speed : hint_range(0.0, 10.0) = 5.0;
uniform vec4 echo_color : source_color = vec4(0.2, 0.5, 0.8, 0.5);
uniform float effect_progress : hint_range(0.0, 1.0) = 0.0; // 0.0 = inactive, 1.0 = full effect

void vertex() {
	// Simple vertex distortion based on noise and time
	vec3 world_vertex = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float noise = sin(world_vertex.x * distortion_speed + TIME) * cos(world_vertex.y * distortion_speed + TIME * 0.7);
	VERTEX.xyz += NORMAL * noise * distortion_strength * effect_progress;
}

void fragment() {
	// Add a tint and make it semi-transparent
	ALBEDO = mix(ALBEDO, echo_color.rgb, echo_color.a * effect_progress);
	ALPHA = mix(ALPHA, echo_color.a, effect_progress);
}
"""
