extends Node

@export var memory_fragments_total: int = 10
@export var audio_stems_node_path: NodePath
@export var dissonance_player_node_path: NodePath
@export var fade_duration: float = 1.0 # Duration for fading out a stem

var _current_identity_integrity: int
var _active_memory_fragments: Dictionary # Maps fragment_id to AudioStreamPlayer
var _dissonance_player: AudioStreamPlayer

func _ready() -> void:
	_current_identity_integrity = memory_fragments_total
	_initialize_music_stems()
	_initialize_dissonance_player()

func _initialize_music_stems() -> void:
	var stems_node: Node = get_node_or_null(audio_stems_node_path)
	if not stems_node:
		push_error("Audio stems node not found at path: %s" % audio_stems_node_path)
		return

	var stem_index: int = 0
	for child in stems_node.get_children():
		if child is AudioStreamPlayer:
			var fragment_id: String = "fragment_%02d" % stem_index
			_active_memory_fragments[fragment_id] = child
			child.play() # Start all stems playing initially
			stem_index += 1
	if _active_memory_fragments.is_empty():
		push_warning("No AudioStreamPlayer nodes found under the specified stems path.")

func _initialize_dissonance_player() -> void:
	_dissonance_player = get_node_or_null(dissonance_player_node_path)
	if not _dissonance_player:
		push_warning("Dissonance player node not found at path: %s. Dissonance effects will be limited." % dissonance_player_node_path)
	else:
		_dissonance_player.volume_db = -80.0 # Start muted
		_dissonance_player.play() # Keep it playing in background, just control volume

func lose_memory_fragment(fragment_id: String) -> void:
	if not _active_memory_fragments.has(fragment_id):
		push_warning("Attempted to lose non-existent memory fragment: %s" % fragment_id)
		return

	_current_identity_integrity -= 1
	var stem_player: AudioStreamPlayer = _active_memory_fragments[fragment_id]

	# Permanently fade out the stem
	var tween: Tween = create_tween()
	tween.tween_property(stem_player, "volume_db", -80.0, fade_duration) # Fade to mute
	tween.set_trans(Tween.TRANS_LINEAR)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_callback(Callable(stem_player, "stop")) # Stop after fading

	_active_memory_fragments.erase(fragment_id) # Mark as lost

	# Trigger dissonance if applicable, based on identity integrity
	if _dissonance_player and _current_identity_integrity <= memory_fragments_total / 2:
		var dissonance_tween: Tween = create_tween()
		dissonance_tween.tween_property(_dissonance_player, "volume_db", -10.0, fade_duration) # Increase dissonance volume
		dissonance_tween.set_trans(Tween.TRANS_LINEAR)
		dissonance_tween.set_ease(Tween.EASE_IN)

func get_current_identity_integrity() -> int:
	return _current_identity_integrity

func get_total_memory_fragments() -> int:
	return memory_fragments_total