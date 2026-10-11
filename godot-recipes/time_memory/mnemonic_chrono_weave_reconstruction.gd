@tool
extends Node3D

# Signals for external game logic to react to weave outcomes
signal weave_successful(effect_type: String)
signal weave_failed(consequence_type: String)
signal identity_frayed()

# Parameters exposed in the editor for easy tuning
@export_range(5.0, 60.0, 1.0) var time_limit_seconds: float = 15.0:
	set(value):
		time_limit_seconds = value
		if not Engine.is_editor_hint():
			_current_time = time_limit_seconds # Reset if active
@export var lyra_shader_material: ShaderMaterial # Assign Lyra's main shader here
@export var fragment_mesh_template: Mesh # Default mesh for fragments
@export var fragment_material_template: Material # Default material for fragments
@export var fragment_highlight_color: Color = Color(0.5, 0.5, 1.0) # Color when selected

# Internal state variables
var _is_active: bool = false
var _current_time: float = 0.0
var _player_sequence: Array[String] = []
var _correct_sequence: Array[String] = []
var _current_chasm_fragments: Array[MeshInstance3D] = []
var _fragment_viewport_container: SubViewportContainer
var _fragment_viewport: SubViewport
var _fragment_root: Node3D
var _fragment_camera: Camera3D

# Shader code for Lyra's identity effect (fray/shield)
const LYRA_IDENTITY_SHADER_CODE = """
shader_type spatial;
uniform float identity_fray_strength : hint_range(0.0, 1.0) = 0.0;
uniform float chrono_shield_strength : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D albedo_texture : source_color;
void fragment() {
	vec4 albedo_tex = texture(albedo_texture, UV);
	vec3 base_color = albedo_tex.rgb;
	// Identity Fray Effect: Desaturation and subtle noise
	float gray = dot(base_color, vec3(0.299, 0.587, 0.114));
	vec3 frayed_color = mix(base_color, vec3(gray), identity_fray_strength * 0.7); // Desaturate
	frayed_color += (texture(SCREEN_TEXTURE, SCREEN_UV * 100.0).r - 0.5) * identity_fray_strength * 0.2; // Noise from screen
	// Chrono Shield Effect: Glowing outline, shimmering
	vec3 shield_color = vec3(0.2, 0.8, 1.0); // Cyan glow
	float shield_effect = sin(TIME * 10.0) * 0.5 + 0.5; // Shimmer
	shield_effect *= chrono_shield_strength;
	ALBEDO = mix(frayed_color, shield_color * shield_effect + base_color, chrono_shield_strength);
	ALPHA = albedo_tex.a;
}
"""

func _ready() -> void:
	_setup_fragment_viewport()
	_current_time = time_limit_seconds

func _process(delta: float) -> void:
	if not _is_active:
		return

	_current_time -= delta
	if _current_time <= 0.0:
		_on_failure("time_out")
		_is_active = false # Stop processing after failure

func _input(event: InputEvent) -> void:
	if not _is_active or not event is InputEventMouseButton or not event.pressed:
		return

	if event.button_index == MOUSE_BUTTON_LEFT:
		_handle_fragment_selection(event.position)

func _setup_fragment_viewport() -> void:
	# Create SubViewportContainer
	_fragment_viewport_container = SubViewportContainer.new()
	_fragment_viewport_container.name = "FragmentViewportContainer"
	_fragment_viewport_container.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	_fragment_viewport_container.size = Vector2(300, 200) # Example size
	_fragment_viewport_container.position = Vector2(10, 10) # Example position
	add_child(_fragment_viewport_container)

	# Create SubViewport
	_fragment_viewport = SubViewport.new()
	_fragment_viewport.name = "FragmentSubViewport"
	_fragment_viewport.size = _fragment_viewport_container.size
	_fragment_viewport.transparent_bg = true
	_fragment_viewport_container.add_child(_fragment_viewport)

	# Create Camera3D for the viewport
	_fragment_camera = Camera3D.new()
	_fragment_camera.name = "FragmentCamera"
	_fragment_camera.transform.origin = Vector3(0, 0, 3)
	_fragment_camera.current = true
	_fragment_viewport.add_child(_fragment_camera)

	# Create a root for fragments within the viewport
	_fragment_root = Node3D.new()
	_fragment_root.name = "FragmentRoot"
	_fragment_viewport.add_child(_fragment_root)

	# Initialize Lyra's shader if not already set up
	if lyra_shader_material and lyra_shader_material.shader == null:
		var new_shader = Shader.new()
		new_shader.code = LYRA_IDENTITY_SHADER_CODE
		lyra_shader_material.shader = new_shader

func start_weave(chasm_data: Dictionary) -> void:
	if _is_active:
		_reset_weave() # Reset any ongoing weave

	_is_active = true
	_current_time = time_limit_seconds
	_player_sequence.clear()
	_correct_sequence = chasm_data.get("correct_sequence", [])
	var fragments_to_spawn = chasm_data.get("fragments", [])

	_spawn_fragments_in_viewport(fragments_to_spawn)
	_apply_lyra_shader_effect(0.0, 0.0) # Reset Lyra's shader

func _spawn_fragments_in_viewport(fragments_data: Array[Dictionary]) -> void:
	for fragment_node in _current_chasm_fragments:
		fragment_node.queue_free()
	_current_chasm_fragments.clear()

	var offset = 0
	for data in fragments_data:
		var fragment_instance = MeshInstance3D.new()
		fragment_instance.mesh = data.get("mesh", fragment_mesh_template)
		fragment_instance.material_override = data.get("material", fragment_material_template)
		fragment_instance.transform.origin = Vector3(offset * 1.5 - (fragments_data.size() - 1) * 0.75, 0, 0)
		fragment_instance.name = "Fragment_%d" % data.get("id", offset)
		fragment_instance.set_meta("temporal_signature", data.get("temporal_signature", "unknown"))
		_fragment_root.add_child(fragment_instance)
		_current_chasm_fragments.append(fragment_instance)
		offset += 1

func _handle_fragment_selection(screen_pos: Vector2) -> void:
	var viewport_local_pos = screen_pos - _fragment_viewport_container.global_position

	if not Rect2(Vector2.ZERO, _fragment_viewport_container.size).has_point(viewport_local_pos):
		return

	var ray_origin = _fragment_camera.project_ray_origin(viewport_local_pos)
	var ray_normal = _fragment_camera.project_ray_normal(viewport_local_pos)
	var ray_end = ray_origin + ray_normal * 1000

	var space_state = _fragment_viewport.get_world_3d().direct_space_state
	var query = PhysicsRayQueryParameters3D.create(ray_origin, ray_end)
	var result = space_state.intersect_ray(query)

	if result and result.collider is MeshInstance3D:
		var selected_fragment = result.collider as MeshInstance3D
		var signature = selected_fragment.get_meta("temporal_signature")
		if signature:
			_player_sequence.append(signature)
			# Apply highlight material
			var highlight_material = StandardMaterial3D.new()
			highlight_material.albedo_color = fragment_highlight_color
			selected_fragment.material_override = highlight_material
			
			if _player_sequence.size() == _correct_sequence.size():
				_check_sequence()

func _check_sequence() -> void:
	if _player_sequence == _correct_sequence:
		_on_success("environment_mend")
	else:
		_on_failure("incorrect_sequence")

func _on_success(effect_type: String) -> void:
	_is_active = false
	_apply_lyra_shader_effect(0.0, 1.0) # Apply chrono-shield
	var tween = create_tween()
	tween.tween_interval(2.0) # Shield duration
	tween.tween_callback(Callable(self, "_apply_lyra_shader_effect").bind(0.0, 0.0)) # Fade shield
	emit_weave_successful.emit(effect_type)
	_reset_weave()

func _on_failure(reason: String) -> void:
	_is_active = false
	_apply_lyra_shader_effect(1.0, 0.0) # Apply identity fray
	var tween = create_tween()
	tween.tween_interval(1.0) # Fray duration
	tween.tween_callback(Callable(self, "_apply_lyra_shader_effect").bind(0.0, 0.0)) # Fade fray
	emit_weave_failed.emit(reason)
	emit_identity_frayed.emit() # Specific signal for identity loss
	_reset_weave()

func _apply_lyra_shader_effect(fray_strength: float, shield_strength: float) -> void:
	if lyra_shader_material:
		lyra_shader_material.set_shader_parameter("identity_fray_strength", fray_strength)
		lyra_shader_material.set_shader_parameter("chrono_shield_strength", shield_strength)

func _reset_weave() -> void:
	_is_active = false
	_player_sequence.clear()
	_correct_sequence.clear()
	for fragment_node in _current_chasm_fragments:
		fragment_node.queue_free()
	_current_chasm_fragments.clear()
