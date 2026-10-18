@tool
extends Node

# --- Parameters ---
@export_range(1, 10, 1) var buffer_size: int = 5:
	set(value):
		buffer_size = max(1, value)
		_resize_buffer()
@export_range(0.1, 5.0, 0.1) var rewind_duration: float = 0.5
@export var memory_fragment_group: StringName = &"memory_fragments"
@export var hunter_group: StringName = &"hunters"
@export var player_node_path: NodePath
@export var ui_shatter_target_path: NodePath # Path to a Control node representing a memory fragment in UI

# --- Internal State ---
var _state_buffer: Array[Dictionary] = []
var _buffer_index: int = 0
var _player_node: Node3D
var _ui_shatter_target: Control

# --- Shader Constants (embedded for standalone recipe) ---
const SHATTER_SHADER_CODE = """
shader_type canvas_item;

uniform float shatter_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec2 shatter_origin_local = vec2(0.5, 0.5); // Local UV coordinate for origin
uniform float shatter_strength = 0.1;
uniform float shatter_speed = 5.0; // Controls how fast the shatter spreads

void fragment() {
	vec2 uv = UV;
	vec4 color = texture(TEXTURE, uv);

	if (shatter_amount > 0.0) {
		// Calculate direction from local shatter origin
		vec2 offset_dir = normalize(uv - shatter_origin_local);
		// Distance from origin
		float dist = length(uv - shatter_origin_local);

		// Calculate offset magnitude based on shatter_amount and distance
		// The shatter spreads outwards from the origin
		float offset_magnitude = max(0.0, shatter_amount - dist * shatter_speed) * shatter_strength;
		uv += offset_dir * offset_magnitude;

		// Re-sample texture with offset UV
		color = texture(TEXTURE, uv);

		// Simple fade out effect for shattered areas
		// This makes fragments disappear as the shatter progresses
		float fade_start_dist_factor = 0.5; // Relative distance from origin where fading starts
		float current_shatter_radius = shatter_amount / shatter_speed; // Approximate radius of current shatter
		float fade_start_radius = current_shatter_radius * fade_start_dist_factor;

		if (dist > fade_start_radius) {
			float fade_factor = smoothstep(fade_start_radius, current_shatter_radius, dist);
			color.a *= (1.0 - fade_factor);
		}
	}

	COLOR = color;
}
"""
var _shatter_material: ShaderMaterial
var _shatter_tween: Tween

# --- Identity Pool (simplified for this recipe) ---
var _collected_memory_fragments: Array[NodePath] = [] # Stores NodePaths of collected fragments

func _ready() -> void:
	_resize_buffer()
	_player_node = get_node_or_null(player_node_path)
	_ui_shatter_target = get_node_or_null(ui_shatter_target_path)

	if not _player_node:
		push_error("Player node not found at path: %s" % player_node_path)
	if not _ui_shatter_target:
		push_warning("UI Shatter Target node not found at path: %s. Shatter effect will not apply to UI." % ui_shatter_target_path)
	else:
		_setup_shatter_material()

func _process(delta: float) -> void:
	_capture_state()

func _resize_buffer() -> void:
	_state_buffer.resize(buffer_size)
	_buffer_index = 0

func _capture_state() -> void:
	if not _player_node:
		return

	var current_state: Dictionary = {
		"player_transform": _player_node.global_transform,
		"memory_fragments": [],
		"hunters": []
	}

	for fragment in get_tree().get_nodes_in_group(memory_fragment_group):
		if fragment is Node3D:
			current_state["memory_fragments"].append({
				"path": fragment.get_path(),
				"transform": fragment.global_transform,
				"is_collected": fragment.get("is_collected") if fragment.has_method("get") else false
			})

	for hunter in get_tree().get_nodes_in_group(hunter_group):
		if hunter is CharacterBody3D:
			current_state["hunters"].append({
				"path": hunter.get_path(),
				"transform": hunter.global_transform,
				"velocity": hunter.velocity
			})

	_state_buffer[_buffer_index] = current_state
	_buffer_index = (_buffer_index + 1) % buffer_size

func _apply_state(state_data: Dictionary) -> void:
	if not _player_node:
		return

	_player_node.global_transform = state_data["player_transform"]

	for fragment_data in state_data["memory_fragments"]:
		var fragment_node = get_node_or_null(fragment_data["path"])
		if fragment_node and fragment_node is Node3D:
			fragment_node.global_transform = fragment_data["transform"]
			if fragment_node.has_method("set"):
				fragment_node.set("is_collected", fragment_data["is_collected"])

	for hunter_data in state_data["hunters"]:
		var hunter_node = get_node_or_null(hunter_data["path"])
		if hunter_node and hunter_node is CharacterBody3D:
			hunter_node.global_transform = hunter_data["transform"]
			hunter_node.velocity = hunter_data["velocity"]

func activate_self_erasure() -> void:
	if _state_buffer.is_empty() or _state_buffer[_buffer_index] == null:
		push_warning("State buffer is empty or current state is null. Cannot rewind.")
		return

	var previous_index = (_buffer_index - 1 + buffer_size) % buffer_size
	var state_to_apply = _state_buffer[previous_index]

	if state_to_apply:
		_apply_state(state_to_apply)
		_remove_random_memory_fragment()
		_trigger_shatter_effect()
	else:
		push_warning("No valid previous state to apply for rewind.")

func _remove_random_memory_fragment() -> void:
	if _collected_memory_fragments.is_empty():
		push_warning("No collected memory fragments to lose.")
		return

	var lost_fragment_path = _collected_memory_fragments.pop_back()
	print("Lost memory fragment: %s" % lost_fragment_path)

func _setup_shatter_material() -> void:
	_shatter_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = SHATTER_SHADER_CODE
	_shatter_material.shader = shader
	_ui_shatter_target.material = _shatter_material
	_shatter_material.set_shader_parameter("shatter_amount", 0.0)
	_shatter_material.set_shader_parameter("shatter_origin_local", Vector2(0.5, 0.5)) # Center of the UI element

func _trigger_shatter_effect() -> void:
	if not _ui_shatter_target or not _shatter_material:
		return

	if _shatter_tween and _shatter_tween.is_running():
		_shatter_tween.kill()

	_shatter_tween = create_tween()
	_shatter_tween.tween_property(_shatter_material, "shader_parameter/shatter_amount", 1.0, rewind_duration)
	_shatter_tween.tween_callback(func():
		_shatter_material.set_shader_parameter("shatter_amount", 0.0)
		# _ui_shatter_target.hide() # Uncomment to hide the UI element after shattering
	)

func add_collected_memory_fragment(fragment_path: NodePath) -> void:
	if not fragment_path in _collected_memory_fragments:
		_collected_memory_fragments.append(fragment_path)
		print("Collected memory fragment: %s" % fragment_path)
