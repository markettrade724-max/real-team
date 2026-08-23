@tool
extends Node

class_name MnemonicUIShatterer

# --- Exported Parameters ---
@export var shatter_duration: float = 0.8 # How long the initial drift animation takes
@export var drift_strength: float = 150.0 # Max pixel distance fragments drift from origin
@export var fade_duration: float = 1.5 # How long fragments take to fade out after drifting
@export var rotation_strength: float = 180.0 # Max degrees fragments rotate
@export_multiline var fragment_shader_code: String = """
shader_type canvas_item;

uniform sampler2D fragment_texture : hint_albedo;
uniform float fade_alpha : hint_range(0.0, 1.0) = 1.0;
uniform float noise_strength : hint_range(0.0, 1.0) = 0.1;
uniform float time_offset : hint_range(0.0, 100.0) = 0.0; // For varying noise

float rand(vec2 co) {
	return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = UV;
	float noise = rand(uv * (TIME + time_offset) * 10.0) * noise_strength;
	uv += vec2(noise, noise) * 0.05;

	vec4 color = texture(fragment_texture, uv);
	color.a *= fade_alpha;
	COLOR = color;
}
"""

# --- Internal State ---
var _active_tweens: Array[Tween] = []

# --- Public API ---
# This function takes a Control node that is composed of smaller Control node 'fragments'.
# It detaches and animates these fragments to simulate shattering.
func shatter_ui_element(ui_element: Control) -> void:
	if not is_node_ready():
		await ready

	if not ui_element:
		push_warning("shatter_ui_element called with null ui_element.")
		return

	# Stop any existing tweens for this element's fragments to prevent conflicts
	for tween in _active_tweens:
		if tween.is_running():
			tween.kill()
	_active_tweens.clear()

	var fragments_to_process: Array[Control] = []

	# Collect children first to avoid issues with reparenting during iteration
	for child in ui_element.get_children():
		if child is Control:
			fragments_to_process.append(child)

	if fragments_to_process.is_empty():
		push_warning("UI element has no Control children to shatter.")
		return

	# Reparent and animate each fragment
	for fragment in fragments_to_process:
		# Ensure fragment has a ShaderMaterial
		if not fragment.material or not fragment.material is ShaderMaterial:
			var shader_material = ShaderMaterial.new()
			var shader = Shader.new()
			shader.code = fragment_shader_code
			shader_material.shader = shader
			fragment.material = shader_material
		else:
			# Update existing shader code if it's a ShaderMaterial
			var shader_material = fragment.material as ShaderMaterial
			if shader_material.shader and shader_material.shader.code != fragment_shader_code:
				shader_material.shader.code = fragment_shader_code

		# Set fragment texture if it's a TextureRect or Panel with StyleBoxTexture
		var fragment_shader_material = fragment.material as ShaderMaterial
		if fragment_shader_material:
			if fragment is TextureRect and fragment.texture:
				fragment_shader_material.set_shader_parameter("fragment_texture", fragment.texture)
			elif fragment is Panel and fragment.get_theme_stylebox("panel") is StyleBoxTexture:
				var stylebox_texture = fragment.get_theme_stylebox("panel") as StyleBoxTexture
				if stylebox_texture.texture:
					fragment_shader_material.set_shader_parameter("fragment_texture", stylebox_texture.texture)
			fragment_shader_material.set_shader_parameter("time_offset", randf() * 100.0) # Randomize noise

		var initial_global_position = fragment.global_position
		var initial_rotation = fragment.rotation

		# Detach fragment from its parent and add to the root for free movement
		fragment.get_parent().remove_child(fragment)
		get_tree().root.add_child(fragment)
		fragment.global_position = initial_global_position # Maintain position after reparenting
		fragment.rotation = initial_rotation

		_animate_fragment(fragment, initial_global_position)

	# Hide the original UI element after its fragments have been detached
	ui_element.visible = false

# --- Private Helpers ---
func _animate_fragment(fragment: Control, initial_global_position: Vector2) -> void:
	var tween = create_tween()
	_active_tweens.append(tween)

	# Random drift target
	var target_offset = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).normalized() * randf_range(drift_strength * 0.5, drift_strength)
	var target_position = initial_global_position + target_offset

	# Random rotation target
	var target_rotation = fragment.rotation + deg_to_rad(randf_range(-rotation_strength, rotation_strength))

	# Animate position and rotation
	tween.tween_property(fragment, "global_position", target_position, shatter_duration)\
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tween.tween_property(fragment, "rotation", target_rotation, shatter_duration)\
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)

	# Animate fade out after drift
	tween.tween_callback(func():
		var fade_tween = create_tween()
		_active_tweens.append(fade_tween)
		var shader_material = fragment.material as ShaderMaterial
		if shader_material:
			fade_tween.tween_property(shader_material, "shader_parameter/fade_alpha", 0.0, fade_duration)\
				.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
			fade_tween.tween_callback(func():
				if is_instance_valid(fragment):
					fragment.queue_free()
				_active_tweens.erase(fade_tween)
			)
		else:
			# Fallback if no shader material, just fade the control node itself
			fade_tween.tween_property(fragment, "modulate:a", 0.0, fade_duration)\
				.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
			fade_tween.tween_callback(func():
				if is_instance_valid(fragment):
					fragment.queue_free()
				_active_tweens.erase(fade_tween)
			)
	)
	tween.tween_callback(func():
		_active_tweens.erase(tween)
	)

# --- Utility ---
func _exit_tree():
	# Clean up any running tweens when the node is removed
	for tween in _active_tweens:
		if tween.is_running():
			tween.kill()
	_active_tweens.clear()
