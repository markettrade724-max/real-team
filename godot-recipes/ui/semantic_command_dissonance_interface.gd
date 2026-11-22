@tool
extends Button

class_name DissonantButton

@export_range(0.0, 1.0) var semantic_coherence: float = 1.0:
	set(value):
		semantic_coherence = clampf(value, 0.0, 1.0)
		_update_dissonance_state()

@export var original_text: String = "Action"
@export var original_action_method: String = "" # Method name on target node

@export var dissonant_options: Array[Dictionary] = [
	{"text": "ATTACK", "action_method": "perform_attack"},
	{"text": "HEAL", "action_method": "perform_heal"},
	{"text": "FORGET", "action_method": "lose_memory"}
]

@export var action_target_node_path: NodePath # Path to the node containing action methods

var _current_action_callable: Callable
var _current_text: String
var _target_node: Node

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_target_node = get_node_or_null(action_target_node_path) if action_target_node_path else get_parent()
	if not _target_node:
		printerr("DissonantButton: No action target node found for path: %s. Defaulting to self." % action_target_node_path)
		_target_node = self # Fallback to self

	_update_dissonance_state()
	pressed.connect(_on_dissonant_button_pressed)

func _update_dissonance_state() -> void:
	var dissonance_strength: float = 1.0 - semantic_coherence

	if material is ShaderMaterial:
		(material as ShaderMaterial).set_shader_parameter("dissonance_strength", dissonance_strength)

	if dissonance_strength < 0.1:
		_current_text = original_text
		_current_action_callable = _get_action_callable(original_action_method)
	else:
		var effective_dissonance = dissonance_strength * (dissonant_options.size() + 1) # +1 to include original as a potential 'blend'
		var chosen_index = int(floor(effective_dissonance))

		var option_to_use: Dictionary
		if chosen_index >= dissonant_options.size():
			option_to_use = dissonant_options.back() # Max dissonance, stick to last option
		elif chosen_index < 0:
			option_to_use = dissonant_options.front() # Min dissonance, stick to first option
		else:
			option_to_use = dissonant_options[chosen_index]

		_current_text = option_to_use.text
		_current_action_callable = _get_action_callable(option_to_use.action_method)

		if dissonance_strength > 0.4: # Start garbling at moderate dissonance
			_current_text = _garble_text(_current_text, dissonance_strength)

	self.text = _current_text

func _get_action_callable(method_name: String) -> Callable:
	if method_name.is_empty() or not _target_node:
		return Callable(self, "_no_action")

	if _target_node.has_method(method_name):
		return Callable(_target_node, method_name)
	else:
		printerr("DissonantButton: Method '%s' not found on target node '%s'." % [method_name, _target_node.name])
		return Callable(self, "_no_action")

func _on_dissonant_button_pressed() -> void:
	if _current_action_callable.is_valid():
		_current_action_callable.call()
	else:
		printerr("DissonantButton: No valid action callable assigned or target node missing.")

func _no_action() -> void:
	print("DissonantButton: No action performed (semantic dissonance).")

func _garble_text(input_text: String, strength: float) -> String:
	var garbled_text = ""
	for i in range(input_text.length()):
		var char = input_text[i]
		if randf() < strength * 0.7: # Adjust garbling frequency
			garbled_text += char(randi_range(33, 126)) # Random printable ASCII
		else:
			garbled_text += char
	return garbled_text
