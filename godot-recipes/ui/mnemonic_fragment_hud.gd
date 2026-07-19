@tool
extends Control

# Shader code embedded as a string
const FRACTURE_SHADER_CODE = """
shader_type canvas_item;

uniform float decay_factor : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D noise_texture : hint_filter_linear; // Assign a NoiseTexture (e.g., FastNoiseLite) here

void fragment() {
	vec2 base_uv = UV;
	
	// Apply distortion based on decay_factor
	// Scale noise for detail, animate it slightly
	vec4 noise_sample = texture(noise_texture, base_uv * 5.0 + TIME * 0.1); 
	vec2 distorted_uv = base_uv + (noise_sample.rg - 0.5) * decay_factor * 0.05; 
	
	vec4 color = texture(TEXTURE, distorted_uv);
	
	// Introduce alpha gaps/flicker
	// As decay increases, threshold decreases, making more parts transparent
	float alpha_threshold = 0.9 - decay_factor * 0.8; 
	if (noise_sample.b < alpha_threshold) {
		color.a *= 0.0; 
	}
	
	// Further scramble/flicker effect
	if (fract(TIME * 10.0 + noise_sample.r * 10.0) < decay_factor * 0.1) {
		color.rgb *= 0.5; // Dim parts
	}
	
	COLOR = color;
}
"""

@export_range(0.0, 1.0, 0.01) var identity_integrity: float = 1.0:
	set(value):
		identity_integrity = clampf(value, 0.0, 1.0)
		_apply_mnemonic_effects()

@export var decay_rate: float = 0.01 # Rate per second
@export var stabilization_amount: float = 0.2 # How much integrity is restored by a memory
@export var stabilization_duration: float = 3.0 # How long stabilization lasts after a memory

@export var noise_texture_resource: Texture2D # Assign a NoiseTexture (e.g., FastNoiseLite) here

var _affected_ui_elements: Array[Control] = []
var _current_stabilization_timer: float = 0.0

func _ready() -> void:
	if Engine.is_editor_hint():
		# In editor, apply effects immediately for visual feedback
		_affected_ui_elements.clear()
		for child in get_children():
			if child is Control:
				_affected_ui_elements.append(child)
				_setup_element_shader(child)
		_apply_mnemonic_effects()
	else:
		# In game, find all children that should be affected
		for child in get_children():
			if child is Control:
				_affected_ui_elements.append(child)
				_setup_element_shader(child)
		_apply_mnemonic_effects()

func _process(delta: float) -> void:
	if Engine.is_editor_hint():
		return

	if _current_stabilization_timer > 0.0:
		_current_stabilization_timer -= delta
	else:
		identity_integrity -= decay_rate * delta
		identity_integrity = clampf(identity_integrity, 0.0, 1.0)
	
	_apply_mnemonic_effects()

func add_memory_fragment() -> void:
	identity_integrity += stabilization_amount
	identity_integrity = clampf(identity_integrity, 0.0, 1.0)
	_current_stabilization_timer = stabilization_duration
	_apply_mnemonic_effects()

func _setup_element_shader(element: Control) -> void:
	var shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = FRACTURE_SHADER_CODE
	shader_material.shader = shader
	shader_material.set_shader_parameter("noise_texture", noise_texture_resource)
	element.material = shader_material

func _apply_mnemonic_effects() -> void:
	var decay_factor: float = 1.0 - identity_integrity
	
	for element in _affected_ui_elements:
		if element.material is ShaderMaterial:
			var shader_material: ShaderMaterial = element.material
			shader_material.set_shader_parameter("decay_factor", decay_factor)
		
		# Apply CanvasItem manipulations
		var rng = RandomNumberGenerator.new()
		rng.seed = element.get_instance_id() # Consistent randomness per element
		
		element.position = Vector2(rng.randf_range(-decay_factor * 5.0, decay_factor * 5.0),
		                           rng.randf_range(-decay_factor * 5.0, decay_factor * 5.0))
		element.rotation = rng.randf_range(-decay_factor * 0.05, decay_factor * 0.05)
		element.scale = Vector2(1.0 - decay_factor * 0.05, 1.0 - decay_factor * 0.05)
		element.modulate.a = 1.0 - decay_factor * 0.2
