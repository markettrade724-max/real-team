extends RichTextLabel

@export var base_monologue: String = "My thoughts are my own. I remember who I am. I must survive."
@export var corruption_speed: float = 5.0 # How fast proximity corruption changes
@export var memory_loss_threshold: float = 0.2 # Below this, words are permanently lost
@export var silence_glyph_pool: Array[String] = ["█", "▓", "░", "▒", "■", "□", "▲", "▼"]

var _current_monologue: String = ""
var _memory_integrity: float = 1.0 # 0.0 to 1.0, 1.0 is perfect
var _silence_proximity_strength: float = 0.0 # 0.0 to 1.0, 1.0 is very close
var _shader_material: ShaderMaterial

const ERODING_WHISPER_SHADER_CODE = """
shader_type canvas_item;

uniform float corruption_strength : hint_range(0.0, 1.0) = 0.0;
uniform float scanline_intensity : hint_range(0.0, 1.0) = 0.1;
uniform float pixelation_amount : hint_range(0.0, 10.0) = 0.0;
uniform float displacement_amount : hint_range(0.0, 0.1) = 0.0;
uniform float time_offset : hint_range(0.0, 1000.0) = 0.0; // To make noise unique per instance

void fragment() {
	vec2 base_uv = UV;
	
	// Displacement
	float noise = texture(TEXTURE, base_uv * 10.0 + TIME * 0.5 + time_offset).r;
	vec2 displaced_uv = base_uv + vec2(noise - 0.5, noise - 0.5) * displacement_amount * corruption_strength;
	
	vec4 color = texture(TEXTURE, displaced_uv);

	// Pixelation
	if (pixelation_amount > 0.0) {
		vec2 pixel_size = 1.0 / (vec2(textureSize(TEXTURE, 0)) / pixelation_amount);
		displaced_uv = floor(displaced_uv / pixel_size) * pixel_size;
		color = texture(TEXTURE, displaced_uv);
	}

	// Scanlines
	float scanline = sin(base_uv.y * 200.0) * 0.5 + 0.5;
	color.rgb -= scanline * scanline_intensity * corruption_strength;

	// Desaturation
	float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	color.rgb = mix(color.rgb, vec3(luma), corruption_strength * 0.7); // More desaturation with higher corruption

	// Alpha fade
	color.a = mix(color.a, 0.0, corruption_strength * 0.3); // Fade out slightly

	COLOR = color;
}
"""

func _ready() -> void:
	_current_monologue = base_monologue
	_shader_material = ShaderMaterial.new()
	var shader = Shader.new()
	shader.code = ERODING_WHISPER_SHADER_CODE
	_shader_material.shader = shader
	material = _shader_material
	_shader_material.set_shader_parameter("time_offset", randf() * 1000.0) # Unique noise per instance
	update_text_display()

func _process(delta: float) -> void:
	# Smoothly update shader parameters based on _silence_proximity_strength
	var target_corruption = _silence_proximity_strength
	var current_corruption = _shader_material.get_shader_parameter("corruption_strength")
	current_corruption = lerp(current_corruption, target_corruption, delta * corruption_speed)
	_shader_material.set_shader_parameter("corruption_strength", current_corruption)
	_shader_material.set_shader_parameter("scanline_intensity", 0.1 + current_corruption * 0.4)
	_shader_material.set_shader_parameter("pixelation_amount", current_corruption * 5.0)
	_shader_material.set_shader_parameter("displacement_amount", current_corruption * 0.05)

func set_base_monologue(text: String) -> void:
	base_monologue = text
	update_text_display()

func update_memory_integrity(integrity: float) -> void:
	_memory_integrity = clampf(integrity, 0.0, 1.0)
	update_text_display()

func update_silence_proximity(strength: float) -> void:
	_silence_proximity_strength = clampf(strength, 0.0, 1.0)
	# Shader parameters are updated in _process for smooth transition
	update_text_display() # Semantic corruption updates immediately

func update_text_display() -> void:
	var corrupted_text = _corrupt_text_semantically(base_monologue, _memory_integrity, _silence_proximity_strength)
	text = corrupted_text

func _corrupt_text_semantically(original_text: String, memory_integrity: float, proximity_strength: float) -> String:
	var words = original_text.split(" ")
	var corrupted_words: PackedStringArray

	for i in range(words.size()):
		var word = words[i]
		if word.is_empty(): # Handle multiple spaces or leading/trailing spaces
			corrupted_words.append(word)
			continue

		var word_corruption_chance = 1.0 - memory_integrity
		var proximity_scramble_chance = proximity_strength

		# Permanent memory loss (semantic gaps)
		if randf() < word_corruption_chance * memory_loss_threshold:
			corrupted_words.append("") # Replace with nothing, creating a gap
			continue

		# Active scrambling due to proximity
		if randf() < proximity_scramble_chance:
			var scrambled_word = ""
			for char_idx in range(word.length()):
				if randf() < proximity_scramble_chance * 0.7: # Higher chance to scramble individual chars
					scrambled_word += silence_glyph_pool[randi() % silence_glyph_pool.size()]
				else:
					scrambled_word += word[char_idx]
			corrupted_words.append(scrambled_word)
		else:
			corrupted_words.append(word)

	return " ".join(corrupted_words)
