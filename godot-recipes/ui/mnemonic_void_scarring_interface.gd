extends CanvasLayer

class_name MnemonicVoidScarringInterface

@export var degradation_threshold: float = 0.5
@export var time_factor: float = 0.5
@export var distortion_strength: float = 0.05
@export var void_color: Color = Color(0.05, 0.0, 0.1, 0.9)

var _vulnerable_ui_elements: Array[Control] = []
var _active_void_scars: Dictionary = {}

const VOID_SCAR_SHADER_CODE = """
shader_type canvas_item;

uniform float time_factor: hint_range(0.0, 1.0) = 0.5;
uniform float distortion_strength: hint_range(0.0, 0.1) = 0.05;
uniform vec4 void_color: source_color = vec4(0.05, 0.0, 0.1, 0.9);

void fragment() {
	vec2 uv = FRAGMENT_UV;

	vec2 distorted_uv = uv;
	distorted_uv.x += sin(uv.y * 10.0 + TIME * time_factor) * distortion_strength;
	distorted_uv.y += cos(uv.x * 12.0 + TIME * time_factor * 0.7) * distortion_strength;

	float edge_fade = 1.0 - distance(uv, vec2(0.5, 0.5)) * 2.0;
	edge_fade = pow(clamp(edge_fade, 0.0, 1.0), 0.5);

	vec4 final_color = void_color;
	final_color.a *= edge_fade;

	float noise = fract(sin(dot(distorted_uv, vec2(12.9898, 78.233))) * 43758.5453);
	final_color.rgb *= (0.8 + noise * 0.2);

	COLOR = final_color;
}
"""

func _ready() -> void:
	pass

func register_vulnerable_ui_element(element: Control) -> void:
	if not _vulnerable_ui_elements.has(element):
		_vulnerable_ui_elements.append(element)

func apply_scarring(degradation_score: float) -> void:
	if degradation_score < degradation_threshold:
		return

	var elements_to_scar: Array[Control] = []
	for element in _vulnerable_ui_elements:
		if element.is_visible_in_tree() and not _active_void_scars.has(element):
			if randf() < (degradation_score - degradation_threshold) * 2.0:
				elements_to_scar.append(element)

	for element in elements_to_scar:
		_scar_ui_element(element)

func recover_memory_fragment(element_to_restore: Control) -> void:
	if _active_void_scars.has(element_to_restore):
		var void_scar_instance = _active_void_scars[element_to_restore]
		void_scar_instance.queue_free()
		_active_void_scars.erase(element_to_restore)
		element_to_restore.visible = true
		element_to_restore.show()

func _scar_ui_element(element: Control) -> void:
	var void_scar_instance = TextureRect.new()
	void_scar_instance.name = "VoidScar_" + element.name
	void_scar_instance.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var shader = Shader.new()
	shader.code = VOID_SCAR_SHADER_CODE
	var shader_material = ShaderMaterial.new()
	shader_material.shader = shader

	shader_material.set_shader_parameter("time_factor", time_factor)
	shader_material.set_shader_parameter("distortion_strength", distortion_strength)
	shader_material.set_shader_parameter("void_color", void_color)

	void_scar_instance.material = shader_material

	void_scar_instance.position = element.global_position
	void_scar_instance.size = element.size
	void_scar_instance.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)

	add_child(void_scar_instance)
	element.visible = false
	_active_void_scars[element] = void_scar_instance
