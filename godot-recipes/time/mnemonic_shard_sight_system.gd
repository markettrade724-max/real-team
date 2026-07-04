@tool
extends CanvasLayer

class_name MnemonicShardSightSystem

# Parameters
@export_range(1, 60, 1) var history_frames: int = 30: # How many frames in the past to look
	set(value):
		history_frames = max(1, value)
		_resize_history_buffer()
@export var activation_cost_per_second: float = 10.0
@export var max_memory_resource: float = 100.0
@export var ghost_color: Color = Color(0.2, 0.8, 1.0, 0.5)
@export var blend_factor: float = 0.5

# Internal state
var _is_active: bool = false
var _current_memory_resource: float = 100.0
var _history_buffer: Array[ImageTexture] = [] # Stores ImageTexture for SCREEN_TEXTURE captures
var _buffer_index: int = 0

# Nodes
@onready var _overlay_rect: TextureRect = $OverlayRect
@onready var _shader_material: ShaderMaterial = _overlay_rect.material as ShaderMaterial

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_resize_history_buffer()
	_current_memory_resource = max_memory_resource
	_overlay_rect.size = get_viewport().size # Ensure overlay matches main viewport size

	# Set initial shader parameters
	_shader_material.set_shader_parameter("ghost_color", ghost_color)
	_shader_material.set_shader_parameter("blend_factor", blend_factor)
	_shader_material.set_shader_parameter("is_active", false)

	# Hide overlay initially
	_overlay_rect.visible = false

func _process(delta: float) -> void:
	if Engine.is_editor_hint():
		return

	_capture_current_frame()

	if _is_active:
		_current_memory_resource -= activation_cost_per_second * delta
		_current_memory_resource = max(0.0, _current_memory_resource)
		_update_shader_with_past_texture()

		if _current_memory_resource <= 0.0:
			deactivate_shard_sight()

func activate_shard_sight() -> void:
	if _current_memory_resource > 0.0 and not _is_active:
		_is_active = true
		_overlay_rect.visible = true
		_shader_material.set_shader_parameter("is_active", true)
		_update_shader_with_past_texture() # Set initial past texture immediately

func deactivate_shard_sight() -> void:
	if _is_active:
		_is_active = false
		_overlay_rect.visible = false
		_shader_material.set_shader_parameter("is_active", false)

func get_current_memory_resource() -> float:
	return _current_memory_resource

func add_memory_resource(amount: float) -> void:
	_current_memory_resource = min(max_memory_resource, _current_memory_resource + amount)

func _capture_current_frame() -> void:
	# Capture the current screen texture
	var viewport_texture: Texture2D = get_viewport().get_texture()
	if viewport_texture:
		var image: Image = viewport_texture.get_image()
		if image:
			var img_texture = ImageTexture.new()
			img_texture.create_from_image(image)
			_history_buffer[_buffer_index] = img_texture
			_buffer_index = (_buffer_index + 1) % history_frames

func _update_shader_with_past_texture() -> void:
	# The texture at _buffer_index is the one that was captured 'history_frames' ago
	var past_texture: Texture2D = _history_buffer[_buffer_index]
	if past_texture:
		_shader_material.set_shader_parameter("past_texture", past_texture)

func _resize_history_buffer() -> void:
	_history_buffer.resize(history_frames)
	for i in range(history_frames):
		_history_buffer[i] = null # Clear old references
	_buffer_index = 0
