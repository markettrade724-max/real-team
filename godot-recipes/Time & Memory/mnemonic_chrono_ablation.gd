extends Node

# --- Shader Code Definitions ---
const MEMORY_DISSOLVE_SHADER_CODE = """
shader_type canvas_item;

uniform sampler2D noise_texture : hint_default_white;
uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec4 color = texture(TEXTURE, UV);
	vec4 noise = texture(noise_texture, UV * 4.0);

	if (noise.r < dissolve_amount) {
		color.a = 0.0;
	} else {
		float edge_fade = smoothstep(dissolve_amount - 0.1, dissolve_amount + 0.1, noise.r);
		color.a *= edge_fade;
	}

	COLOR = color;
}
"""

const ENVIRONMENTAL_SCAR_SHADER_CODE = """
shader_type spatial;
render_mode unshaded;
render_mode blend_mix;
render_mode depth_draw_opaque;

uniform sampler2D screen_texture : hint_screen_texture;
uniform float scar_intensity : hint_range(0.0, 1.0) = 0.7;
uniform float glitch_speed : hint_range(0.0, 10.0) = 5.0;
uniform float glitch_amount : hint_range(0.0, 0.1) = 0.02;

void fragment() {
	vec2 screen_uv = SCREEN_UV;

	vec2 offset_uv = screen_uv;
	float time = TIME * glitch_speed;
	offset_uv.x += sin(time + screen_uv.y * 10.0) * glitch_amount;
	offset_uv.y += cos(time * 0.5 + screen_uv.x * 8.0) * glitch_amount * 0.5;

	vec4 original_color = texture(screen_texture, screen_uv);
	vec4 distorted_color = texture(screen_texture, offset_uv);

	vec4 final_color = mix(original_color, distorted_color, scar_intensity);

	float luma = dot(final_color.rgb, vec3(0.2126, 0.7152, 0.0722));
	final_color.rgb = mix(final_color.rgb, vec3(luma), scar_intensity * 0.5);

	ALBEDO = final_color.rgb;
	ALPHA = final_color.a * scar_intensity;
}
"""
# --- End Shader Code Definitions ---

@export var ablation_radius: float = 5.0
@export var rewind_duration: float = 0.5
@export var memory_fragment_path: NodePath # Path to a TextureRect on HUD
@export var scar_mesh_scale: float = 1.0 # Multiplier for the scar mesh size

var _physics_states: Dictionary = {}
var _is_rewinding: bool = false
var _memory_dissolve_material: ShaderMaterial
var _environmental_scar_material: ShaderMaterial
var _scar_mesh_scene: PackedScene

func _ready():
	_setup_shaders()
	_setup_scar_mesh_scene()

func _setup_shaders():
	var memory_shader = Shader.new()
	memory_shader.code = MEMORY_DISSOLVE_SHADER_CODE
	_memory_dissolve_material = ShaderMaterial.new()
	_memory_dissolve_material.shader = memory_shader

	var scar_shader = Shader.new()
	scar_shader.code = ENVIRONMENTAL_SCAR_SHADER_CODE
	_environmental_scar_material = ShaderMaterial.new()
	_environmental_scar_material.shader = scar_shader

func _setup_scar_mesh_scene():
	var mesh_instance = MeshInstance3D.new()
	var plane_mesh = PlaneMesh.new()
	plane_mesh.size = Vector2(1, 1)
	plane_mesh.subdivide_depth = 0
	plane_mesh.subdivide_width = 0
	mesh_instance.mesh = plane_mesh
	mesh_instance.material_override = _environmental_scar_material.duplicate() # Each scar needs its own material instance
	_scar_mesh_scene = PackedScene.new()
	_scar_mesh_scene.pack(mesh_instance)

func activate_ablation(ablation_origin: Vector3):
	if _is_rewinding:
		return

	_is_rewinding = true
	_capture_physics_states(ablation_origin)
	_apply_memory_dissolution()
	_create_environmental_scar(ablation_origin)
	_rewind_physics_bodies()

func _capture_physics_states(origin: Vector3):
	_physics_states.clear()
	var space_state = get_world_3d().direct_space_state
	var query = PhysicsShapeQueryParameters3D.new()
	query.shape = SphereShape3D.new()
	query.shape.radius = ablation_radius
	query.transform = Transform3D(Basis(), origin)
	query.collision_mask = 1 # Configure this to target specific physics layers

	var results = space_state.intersect_shape(query)
	for result in results:
		var body = result.collider
		if body is RigidBody3D:
			_physics_states[body] = {
				"global_transform": body.global_transform,
				"linear_velocity": body.linear_velocity,
				"angular_velocity": body.angular_velocity
			}
			body.sleeping = true
			body.set_physics_process_mode(Node.PHYSICS_PROCESS_MODE_DISABLED)

func _rewind_physics_bodies():
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tween.finished.connect(_on_rewind_finished)

	for body in _physics_states.keys():
		if not is_instance_valid(body):
			continue

		var initial_state = _physics_states[body]
		tween.tween_property(body, "global_transform", initial_state.global_transform, rewind_duration)
		tween.tween_property(body, "linear_velocity", Vector3.ZERO, rewind_duration)
		tween.tween_property(body, "angular_velocity", Vector3.ZERO, rewind_duration)

func _on_rewind_finished():
	for body in _physics_states.keys():
		if is_instance_valid(body):
			body.set_physics_process_mode(Node.PHYSICS_PROCESS_MODE_INHERIT)
			body.sleeping = false
	_is_rewinding = false
	_physics_states.clear()

func _apply_memory_dissolution():
	var fragment_node = get_node_or_null(memory_fragment_path)
	if fragment_node and fragment_node is TextureRect:
		fragment_node.material = _memory_dissolve_material.duplicate() # Assign a new instance
		var material = fragment_node.material as ShaderMaterial
		material.set_shader_parameter("dissolve_amount", 0.0)
		fragment_node.visible = true # Ensure it's visible before dissolving

		var tween = create_tween()
		tween.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_SINE)
		tween.tween_property(material, "shader_parameter/dissolve_amount", 1.0, 1.0)
		tween.finished.connect(func(): fragment_node.visible = false)
	else:
		push_warning("Memory fragment node not found or not a TextureRect at path: %s" % memory_fragment_path)

func _create_environmental_scar(origin: Vector3):
	var scar_instance = _scar_mesh_scene.instantiate() as MeshInstance3D
	if not scar_instance:
		push_warning("Failed to instantiate scar mesh scene.")
		return

	get_tree().current_scene.add_child(scar_instance)
	scar_instance.global_position = origin

	var camera = get_viewport().get_camera_3d()
	if camera:
		scar_instance.look_at(camera.global_position, Vector3.UP, true)
		scar_instance.global_position = origin + (camera.global_position - origin).normalized() * 0.1
		scar_instance.scale = Vector3(ablation_radius * 2 * scar_mesh_scale, ablation_radius * 2 * scar_mesh_scale, 1)
