extends Control

@export_file("*.gdshader") var ripple_shader_path: String = ""
@export var ripple_duration: float = 0.5
@export var ripple_max_strength: float = 0.05
@export var fracture_duration: float = 0.3
@export var fracture_shake_amount: float = 10.0

var _ripple_shader_material: ShaderMaterial
var _sub_viewport: SubViewport
var _hud_container: Control # The actual container for all HUD elements

func _ready() -> void:
	_setup_interface_nodes()
	_load_shader_material()

func _setup_interface_nodes() -> void:
	# Ensure the necessary nodes exist and are correctly configured
	var sub_viewport_container = find_child("SubViewportContainer")
	if not sub_viewport_container:
		sub_viewport_container = SubViewportContainer.new()
		sub_viewport_container.name = "SubViewportContainer"
		add_child(sub_viewport_container)
		sub_viewport_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		sub_viewport_container.set_stretch(true) # Crucial for SubViewport to fill it

	_sub_viewport = sub_viewport_container.find_child("SubViewport")
	if not _sub_viewport:
		_sub_viewport = SubViewport.new()
		_sub_viewport.name = "SubViewport"
		sub_viewport_container.add_child(_sub_viewport)
		_sub_viewport.set_update_mode(SubViewport.UPDATE_ALWAYS)
		_sub_viewport.set_transparent_background(true)
		_sub_viewport.size = sub_viewport_container.size # Initial size, will be stretched by container

	var texture_rect = find_child("RippleEffectTextureRect")
	if not texture_rect:
		texture_rect = TextureRect.new()
		texture_rect.name = "RippleEffectTextureRect"
		add_child(texture_rect)
		texture_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		texture_rect.set_expand_mode(TextureRect.EXPAND_IGNORE_SIZE)
		texture_rect.set_stretch_mode(TextureRect.STRETCH_KEEP_ASPECT_COVER)

	# The TextureRect will display the SubViewport's content
	if _sub_viewport.is_node_ready():
		texture_rect.set_texture(_sub_viewport.get_texture())
	else:
		await _sub_viewport.ready
		texture_rect.set_texture(_sub_viewport.get_texture())

	# Find the actual HUD container within the SubViewport
	_hud_container = _sub_viewport.find_child("HUD_Elements_Container")
	if not _hud_container:
		_hud_container = Control.new()
		_hud_container.name = "HUD_Elements_Container"
		_sub_viewport.add_child(_hud_container)
		_hud_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _load_shader_material() -> void:
	if not ripple_shader_path.is_empty():
		var shader = load(ripple_shader_path)
		if shader is Shader:
			_ripple_shader_material = ShaderMaterial.new()
			_ripple_shader_material.set_shader(shader)
			var texture_rect = find_child("RippleEffectTextureRect")
			if texture_rect:
				texture_rect.set_material(_ripple_shader_material)
		else:
			push_error("Failed to load shader from path: ", ripple_shader_path)

func trigger_memory_ripple(memory_pos_normalized: Vector2 = Vector2(0.5, 0.5)) -> void:
	if not _ripple_shader_material:
		return

	_ripple_shader_material.set_shader_parameter("ripple_center", memory_pos_normalized)
	var tween = create_tween()
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(_ripple_shader_material, "shader_parameter/ripple_strength", ripple_max_strength, ripple_duration / 2.0)
	tween.tween_property(_ripple_shader_material, "shader_parameter/ripple_strength", 0.0, ripple_duration / 2.0)
	tween.play()

func trigger_damage_fracture() -> void:
	if not _hud_container:
		return

	var tween = create_tween()
	tween.set_trans(Tween.TRANS_ELASTIC)
	tween.set_ease(Tween.EASE_OUT)

	# Animate the HUD container itself for a shake effect
	var original_position = _hud_container.position
	tween.tween_property(_hud_container, "position", original_position + Vector2(randf_range(-fracture_shake_amount, fracture_shake_amount), randf_range(-fracture_shake_amount, fracture_shake_amount)), fracture_duration / 4.0)
	tween.tween_property(_hud_container, "position", original_position, fracture_duration / 4.0)
	tween.tween_property(_hud_container, "position", original_position + Vector2(randf_range(-fracture_shake_amount, fracture_shake_amount), randf_range(-fracture_shake_amount, fracture_shake_amount)), fracture_duration / 4.0)
	tween.tween_property(_hud_container, "position", original_position, fracture_duration / 4.0)
	tween.play()

	# Optionally, animate a global shader parameter for a brief distortion on damage
	if _ripple_shader_material:
		_ripple_shader_material.set_shader_parameter("ripple_center", Vector2(0.5, 0.5)) # Center the damage distortion
		var shader_tween = create_tween()
		shader_tween.set_trans(Tween.TRANS_SINE)
		shader_tween.set_ease(Tween.EASE_OUT)
		shader_tween.tween_property(_ripple_shader_material, "shader_parameter/ripple_strength", ripple_max_strength * 1.5, fracture_duration / 2.0)
		shader_tween.tween_property(_ripple_shader_material, "shader_parameter/ripple_strength", 0.0, fracture_duration / 2.0)
		shader_tween.play()
