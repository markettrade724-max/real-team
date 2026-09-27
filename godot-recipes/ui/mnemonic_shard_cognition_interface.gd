extends Control

# --- Shader Code (Embedded for standalone recipe) ---
const SHADER_CODE = """
shader_type canvas_item;

uniform float time;
uniform float distortion_strength = 0.1; // Global distortion level
uniform float focus_strength = 0.0; // 0.0 = fully distorted, 1.0 = hint visible
uniform vec4 base_color : source_color = vec4(0.5, 0.5, 0.5, 1.0);
uniform sampler2D hint_texture : hint_default_white; // Texture to hint at the item

void fragment() {
	vec2 uv_offset = vec2(
		sin(UV.y * 10.0 + time * 2.0) * distortion_strength * 0.05,
		cos(UV.x * 12.0 + time * 1.5) * distortion_strength * 0.05
	);
	
	vec2 final_uv = UV + uv_offset;
	
	vec4 current_color = base_color;

	if (hint_texture != null) {
		vec4 hint_tex_color = texture(hint_texture, final_uv);
		current_color = mix(current_color, hint_tex_color, focus_strength);
	}
	
	// Add a subtle pulse effect
	float pulse = sin(time * 3.0) * 0.1 + 0.9;
	current_color.rgb *= pulse;

	COLOR = current_color;
}
"""

# --- Exported Parameters ---
@export var shard_size: Vector2 = Vector2(64, 64)
@export var max_shards: int = 10
@export var focus_cost_per_second: float = 0.1 # Placeholder for resource cost
@export var focus_duration: float = 0.5 # How long it takes to fully focus
@export var base_distortion_strength: float = 0.1

# --- Internal State ---
var _memory_shards: Array[Dictionary] = [] # Stores {id, hint_texture_path, base_color}
var _shard_controls: Array[Control] = []
var _focused_shard_index: int = -1
var _focus_timer: float = 0.0
var _shader: Shader # To hold the dynamically created shader resource

# --- Global State (Assumed, for demonstration) ---
# In a real game, these would come from a global LyraState singleton
var _lyra_memory_decay: float = 0.0 # 0.0 = clear, 1.0 = fully decayed
var _silence_proximity: float = 0.0 # 0.0 = far, 1.0 = close

# --- Built-in Methods ---
func _ready() -> void:
	_shader = Shader.new()
	_shader.code = SHADER_CODE

	# Example shards (in a real game, these would be loaded dynamically)
	add_shard({
		"id": "kinetic_blast",
		"hint_texture_path": "res://assets/textures/hint_blast.png", # Placeholder path
		"base_color": Color.RED
	})
	add_shard({
		"id": "shield_barrier",
		"hint_texture_path": "res://assets/textures/hint_shield.png", # Placeholder path
		"base_color": Color.BLUE
	})

	_setup_shard_controls()

func _process(delta: float) -> void:
	_update_global_shader_params(delta)
	_handle_focus_logic(delta)

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept") and _focused_shard_index != -1:
		_use_focused_shard()
		get_viewport().set_input_as_handled()
	
	if event.is_action_pressed("ui_left"):
		_change_focus(-1)
		get_viewport().set_input_as_handled()
	if event.is_action_pressed("ui_right"):
		_change_focus(1)
		get_viewport().set_input_as_handled()

# --- Custom Methods ---
func add_shard(shard_data: Dictionary) -> void:
	if _memory_shards.size() < max_shards:
		_memory_shards.append(shard_data)
		if is_node_ready():
			_add_shard_control(shard_data)

func _setup_shard_controls() -> void:
	for child in get_children():
		child.queue_free()
	_shard_controls.clear()

	for shard_data in _memory_shards:
		_add_shard_control(shard_data)
	
	_reposition_shard_controls()
	_change_focus(0)

func _add_shard_control(shard_data: Dictionary) -> void:
	var shard_control = Control.new()
	shard_control.custom_minimum_size = shard_size
	shard_control.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(shard_control)
	_shard_controls.append(shard_control)

	var material = ShaderMaterial.new()
	material.shader = _shader # Use the embedded shader
	shard_control.material = material
	
	material.set_shader_parameter("base_color", shard_data.base_color)
	if shard_data.has("hint_texture_path") and not shard_data.hint_texture_path.is_empty():
		var texture = load(shard_data.hint_texture_path)
		if texture:
			material.set_shader_parameter("hint_texture", texture)
		else:
			material.set_shader_parameter("hint_texture", null)
	else:
		material.set_shader_parameter("hint_texture", null)

func _reposition_shard_controls() -> void:
	var total_width = _shard_controls.size() * shard_size.x
	var start_x = (size.x - total_width) / 2.0
	for i in range(_shard_controls.size()):
		var control = _shard_controls[i]
		control.position = Vector2(start_x + i * shard_size.x, (size.y - shard_size.y) / 2.0)

func _update_global_shader_params(delta: float) -> void:
	# Simulate global state changes for demonstration
	_lyra_memory_decay = sin(Engine.get_process_uptime_seconds() * 0.5) * 0.3 + 0.7 # Waving between 0.4 and 1.0
	_silence_proximity = cos(Engine.get_process_uptime_seconds() * 0.8) * 0.4 + 0.6 # Waving between 0.2 and 1.0

	for i in range(_shard_controls.size()):
		var control = _shard_controls[i]
		var material: ShaderMaterial = control.material
		if material and material.shader:
			material.set_shader_parameter("time", Engine.get_process_uptime_seconds())
			
			# Procedural distortion modulation based on game state
			var current_distortion = base_distortion_strength + _lyra_memory_decay * 0.3 + _silence_proximity * 0.2
			material.set_shader_parameter("distortion_strength", current_distortion)

func _handle_focus_logic(delta: float) -> void:
	for i in range(_shard_controls.size()):
		var control = _shard_controls[i]
		var material: ShaderMaterial = control.material
		if material and material.shader:
			var target_focus_strength = 0.0
			if i == _focused_shard_index:
				_focus_timer = min(_focus_timer + delta, focus_duration)
				target_focus_strength = _focus_timer / focus_duration
				# In a real game, this would apply a cost to Lyra's attention/movement speed
				# Example: LyraState.apply_attention_cost(focus_cost_per_second * delta)
			else:
				_focus_timer = max(_focus_timer - delta, 0.0)
				target_focus_strength = _focus_timer / focus_duration
			
			# Smoothly interpolate focus_strength for visual effect
			var current_focus = material.get_shader_parameter("focus_strength")
			material.set_shader_parameter("focus_strength", lerp(current_focus, target_focus_strength, delta * 10.0))

func _change_focus(direction: int) -> void:
	if _shard_controls.is_empty():
		_focused_shard_index = -1
		return

	var new_index = _focused_shard_index + direction
	if new_index < 0:
		new_index = _shard_controls.size() - 1
	elif new_index >= _shard_controls.size():
		new_index = 0
	
	if new_index != _focused_shard_index:
		_focused_shard_index = new_index
		_focus_timer = 0.0 # Reset timer for new focus

func _use_focused_shard() -> void:
	if _focused_shard_index != -1 and _focus_timer >= focus_duration * 0.9: # Only if sufficiently focused
		var shard_data = _memory_shards[_focused_shard_index]
		print("Used shard: ", shard_data.id)
		# In a real game, this would trigger the shard's effect
		# Example: LyraState.activate_shard(shard_data.id)
		
		# Remove shard after use (optional, based on game design)
		_memory_shards.remove_at(_focused_shard_index)
		_shard_controls[_focused_shard_index].queue_free()
		_shard_controls.remove_at(_focused_shard_index)
		_focused_shard_index = -1 # Clear focus
		_reposition_shard_controls()
		_change_focus(0)
