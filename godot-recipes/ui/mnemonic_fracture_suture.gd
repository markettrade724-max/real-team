extends Control

signal suture_completed(info_id: String)
signal information_fractured(info_id: String)

@export var fragment_base_scene: PackedScene # A scene for individual fragment Control nodes, e.g., a Control with a Label
@export var suture_threshold: float = 10.0 # Max distance for alignment
@export var decay_time: float = 5.0 # Time before sutured info fractures again
@export var fragment_count: int = 4 # How many pieces to break the info into

var _fragments: Array[Control]
var _target_positions: Dictionary # Stores target positions for each fragment (fragment_id -> Vector2)
var _is_sutured: bool = false
var _current_info_id: String = ""
var _decay_timer: Timer
var _dragged_fragment: Control = null
var _drag_offset: Vector2

func _ready() -> void:
	_decay_timer = Timer.new()
	add_child(_decay_timer)
	_decay_timer.one_shot = true
	_decay_timer.timeout.connect(_on_decay_timer_timeout)

func display_information(info_id: String, text_content: String, target_rect: Rect2) -> void:
	_clear_fragments()
	_current_info_id = info_id
	_generate_fragments(text_content, target_rect)
	_apply_suture_grammar(target_rect)
	_is_sutured = false

func _clear_fragments() -> void:
	for fragment in _fragments:
		fragment.queue_free()
	_fragments.clear()
	_target_positions.clear()
	_decay_timer.stop()

func _generate_fragments(text_content: String, target_rect: Rect2) -> void:
	var fragment_texts: Array[String] = _split_text_content(text_content)
	for i in range(min(fragment_count, fragment_texts.size())):
		var fragment_instance: Control = fragment_base_scene.instantiate()
		add_child(fragment_instance)
		fragment_instance.name = "Fragment_%d" % i
		fragment_instance.set_meta("fragment_id", i)
		
		if fragment_instance.has_node("Label"):
			var label: Label = fragment_instance.get_node("Label")
			label.text = fragment_texts[i]
			label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		
		fragment_instance.global_position = Vector2(
			randf_range(0, get_viewport_rect().size.x - fragment_instance.size.x),
			randf_range(0, get_viewport_rect().size.y - fragment_instance.size.y)
		)
		fragment_instance.gui_input.connect(Callable(self, "_on_fragment_gui_input").bind(fragment_instance))
		_fragments.append(fragment_instance)

func _split_text_content(text: String) -> Array[String]:
	var words: Array[String> = text.split(" ")
	var result: Array[String]
	var words_per_fragment: int = max(1, ceil(float(words.size()) / fragment_count))
	for i in range(fragment_count):
		var start_idx: int = i * words_per_fragment
		var end_idx: int = min((i + 1) * words_per_fragment, words.size())
		if start_idx < words.size():
			result.append(" ".join(words.slice(start_idx, end_idx)))
		else:
			result.append("") # Ensure we always have fragment_count elements
	return result

func _apply_suture_grammar(target_rect: Rect2) -> void:
	var col_count: int = ceil(sqrt(fragment_count))
	var row_count: int = ceil(float(fragment_count) / col_count)
	var cell_size: Vector2 = target_rect.size / Vector2(col_count, row_count)
	for i in range(_fragments.size()):
		var fragment_id: int = _fragments[i].get_meta("fragment_id")
		var col: int = i % col_count
		var row: int = i / col_count
		var target_pos: Vector2 = target_rect.position + Vector2(col * cell_size.x, row * cell_size.y)
		_target_positions[fragment_id] = target_pos

func _on_fragment_gui_input(event: InputEvent, fragment: Control) -> void:
	if _is_sutured:
		return

	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_dragged_fragment = fragment
				_drag_offset = fragment.global_position - get_global_mouse_position()
			else:
				_dragged_fragment = null
				_check_suture_completion()
	elif event is InputEventMouseMotion:
		if _dragged_fragment == fragment:
			_dragged_fragment.global_position = get_global_mouse_position() + _drag_offset

func _check_suture_completion() -> void:
	if _is_sutured:
		return

	var all_aligned: bool = true
	for fragment in _fragments:
		var fragment_id: int = fragment.get_meta("fragment_id")
		var target_pos: Vector2 = _target_positions.get(fragment_id, fragment.global_position)
		if fragment.global_position.distance_to(target_pos) > suture_threshold:
			all_aligned = false
			break
	
	if all_aligned:
		_suture_fragments()

func _suture_fragments() -> void:
	_is_sutured = true
	var tween: Tween = create_tween()
	for fragment in _fragments:
		var fragment_id: int = fragment.get_meta("fragment_id")
		var target_pos: Vector2 = _target_positions[fragment_id]
		tween.tween_property(fragment, "global_position", target_pos, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	
	tween.tween_callback(Callable(self, "emit_suture_completed").bind(_current_info_id))
	_decay_timer.start(decay_time)

func _on_decay_timer_timeout() -> void:
	_fracture_fragments()

func _fracture_fragments() -> void:
	_is_sutured = false
	var tween: Tween = create_tween()
	for fragment in _fragments:
		var random_pos: Vector2 = Vector2(
			randf_range(0, get_viewport_rect().size.x - fragment.size.x),
			randf_range(0, get_viewport_rect().size.y - fragment.size.y)
		)
		tween.tween_property(fragment, "global_position", random_pos, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	
	tween.tween_callback(Callable(self, "emit_information_fractured").bind(_current_info_id))
