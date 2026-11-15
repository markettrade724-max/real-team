class_name MemoryShard
extends Control

# --- Shader Code ---
const SHARD_SHADER_CODE = """
shader_type canvas_item;

uniform float decay_progress : hint_range(0.0, 1.0) = 0.0;
uniform bool is_anchored = false;
uniform bool is_grabbed = false;
uniform vec4 base_color : source_color;
uniform vec4 anchor_color : source_color;
uniform vec4 grabbed_color : source_color;

void fragment() {
	vec4 final_color = base_color;
	if (is_anchored) {
		final_color = anchor_color;
	} else if (is_grabbed) {
		final_color = grabbed_color;
	}
	
	// Shimmer effect (simple noise based on UV and TIME)
	float shimmer = sin(UV.x * 10.0 + TIME * 5.0) * 0.1 + cos(UV.y * 15.0 + TIME * 7.0) * 0.1;
	final_color.rgb += shimmer * (1.0 - decay_progress); // Less shimmer when decaying

	// Decay effect: fade out and distort
	final_color.a *= (1.0 - decay_progress);
	COLOR = final_color;
}
"""

# --- Exported Properties ---
@export_range(0.0, 1.0, 0.01) var silence_pull_strength: float = 0.1
@export_range(0.0, 1.0, 0.01) var decay_rate: float = 0.01 # Per second
@export var shard_id: String = ""
@export var shard_data: Dictionary = {} # e.g., {"type": "ability", "name": "Dash"}

# --- Internal State ---
var _velocity: Vector2 = Vector2.ZERO
var _target_position: Vector2 = Vector2.ZERO
var _is_grabbed: bool = false
var _is_anchored: bool = false
var _decay_progress: float = 0.0
var _grab_offset: Vector2 = Vector2.ZERO
var _tween: Tween

# --- Signals ---
signal shattered(shard_id: String)
signal anchored(shard_id: String)
signal grabbed(shard_id: String)
signal released(shard_id: String)

func _ready() -> void:
	var material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = SHARD_SHADER_CODE
	material.shader = shader
	material.set_shader_parameter("base_color", Color(0.6, 0.8, 1.0, 0.8))
	material.set_shader_parameter("anchor_color", Color(0.2, 1.0, 0.2, 1.0))
	material.set_shader_parameter("grabbed_color", Color(1.0, 0.8, 0.2, 0.9))
	material.set_shader_parameter("decay_progress", _decay_progress)
	material.set_shader_parameter("is_anchored", _is_anchored)
	material.set_shader_parameter("is_grabbed", _is_grabbed)
	set_material(material)

	_set_random_target_position()
	
	_tween = create_tween()
	_tween.set_parallel(true)

func _process(delta: float) -> void:
	if _is_anchored:
		return

	_decay_progress += decay_rate * delta
	_decay_progress = clampf(_decay_progress, 0.0, 1.0)
	(get_material() as ShaderMaterial).set_shader_parameter("decay_progress", _decay_progress)

	if _decay_progress >= 1.0:
		_shatter()
		return

	if not _is_grabbed:
		_apply_drift_and_silence_forces(delta)
		position += _velocity * delta
		position = position.clamp(Vector2.ZERO, get_parent_control_rect().size - size)
	
	_update_visuals()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MouseButton.LEFT:
			if event.pressed:
				_grab(event.position)
				get_viewport().set_input_as_handled()
			elif _is_grabbed:
				_release()
				get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _is_grabbed:
		global_position = event.global_position - _grab_offset
		get_viewport().set_input_as_handled()

func _set_random_target_position() -> void:
	var parent_rect = get_parent_control_rect()
	_target_position = Vector2(
		randf_range(0, parent_rect.size.x - size.x),
		randf_range(0, parent_rect.size.y - size.y)
	)

func _apply_drift_and_silence_forces(delta: float) -> void:
	var drift_force = (_target_position - position).normalized() * 50.0
	_velocity = _velocity.lerp(drift_force, delta * 2.0)

	var parent_rect = get_parent_control_rect()
	var center = parent_rect.size / 2.0
	var dist_to_center = (position + size/2.0) - center
	var silence_force = dist_to_center.normalized() * silence_pull_strength * 100.0
	_velocity += silence_force * delta * 5.0

	_velocity *= 0.98

func _grab(local_mouse_pos: Vector2) -> void:
	if _is_anchored:
		return
	_is_grabbed = true
	_grab_offset = local_mouse_pos
	(get_material() as ShaderMaterial).set_shader_parameter("is_grabbed", true)
	emit_signal("grabbed", shard_id)

func _release() -> void:
	_is_grabbed = false
	(get_material() as ShaderMaterial).set_shader_parameter("is_grabbed", false)
	
	var anchor_zone_threshold = 50.0
	if position.length() < anchor_zone_threshold:
		_anchor()
	else:
		_set_random_target_position()
	emit_signal("released", shard_id)

func _anchor() -> void:
	_is_anchored = true
	_is_grabbed = false
	(get_material() as ShaderMaterial).set_shader_parameter("is_anchored", true)
	(get_material() as ShaderMaterial).set_shader_parameter("is_grabbed", false)
	
	_velocity = Vector2.ZERO
	if _tween.is_running():
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "position", Vector2(0, 0), 0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	
	emit_signal("anchored", shard_id)

func _shatter() -> void:
	if _tween.is_running():
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "scale", Vector2.ZERO, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_tween.tween_property(self, "modulate:a", 0.0, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	_tween.tween_callback(queue_free)
	emit_signal("shattered", shard_id)

func _update_visuals() -> void:
	# This function is a placeholder for more complex visual updates if needed.
	# Current visual updates are handled directly in _process and grab/anchor/release.
	pass

func get_parent_control_rect() -> Rect2:
	if get_parent() is Control:
		return (get_parent() as Control).get_rect()
	return Rect2(Vector2.ZERO, get_viewport_rect().size)
