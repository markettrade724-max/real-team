@tool
extends CanvasLayer

@export var echo_effect_duration: float = 0.5
@export var prediction_time_offset: float = 0.75
@export var echo_shader: ShaderMaterial

var _sub_viewport: SubViewport
var _display_rect: TextureRect
var _active: bool = false
var _timer: float = 0.0

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_sub_viewport = SubViewport.new()
	_sub_viewport.name = "EchoSubViewport"
	_sub_viewport.size = DisplayServer.window_get_size()
	_sub_viewport.transparent_bg = true
	_sub_viewport.usage = SubViewport.USAGE_3D
	_sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_sub_viewport.world_3d = get_viewport().get_world_3d() # Render the main 3D world
	add_child(_sub_viewport)

	var sub_camera = Camera3D.new()
	sub_camera.name = "EchoSubCamera"
	_sub_viewport.add_child(sub_camera)
	sub_camera.current = true

	_display_rect = TextureRect.new()
	_display_rect.name = "EchoDisplayRect"
	_display_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_display_rect.anchors_preset = Control.ANCHORS_FULL_RECT
	_display_rect.texture = _sub_viewport.get_texture()
	_display_rect.material = echo_shader
	_display_rect.visible = false
	add_child(_display_rect)

func _process(delta: float) -> void:
	if not _active:
		return

	_timer -= delta
	if _timer <= 0:
		deactivate_echo_sight()
		return

	if echo_shader:
		echo_shader.set_shader_parameter("fade_alpha", _timer / echo_effect_duration)
		echo_shader.set_shader_parameter("time", Time.get_ticks_msec() / 1000.0)

	var main_camera = get_viewport().get_camera_3d()
	var sub_camera = _sub_viewport.get_node_or_null("EchoSubCamera")
	if main_camera and sub_camera:
		sub_camera.global_transform = main_camera.global_transform

func activate_echo_sight() -> void:
	if _active:
		return

	_active = true
	_timer = echo_effect_duration
	_display_rect.visible = true

	# Placeholder for actual prediction logic.
	# In a real game, this would calculate the future position/state of an imminent danger.
	var predicted_danger_world_pos = Vector3(0, -5, 0) # Example: a platform collapsing at world (0,-5,0)
	if echo_shader:
		echo_shader.set_shader_parameter("echo_active", true)
		echo_shader.set_shader_parameter("predicted_danger_world_pos", predicted_danger_world_pos)
		var main_camera = get_viewport().get_camera_3d()
		if main_camera:
			echo_shader.set_shader_parameter("camera_projection_matrix", main_camera.get_projection_matrix())
			echo_shader.set_shader_parameter("camera_inverse_transform", main_camera.global_transform.inverse())

func deactivate_echo_sight() -> void:
	_active = false
	_display_rect.visible = false
	if echo_shader:
		echo_shader.set_shader_parameter("echo_active", false)
		echo_shader.set_shader_parameter("fade_alpha", 0.0)
