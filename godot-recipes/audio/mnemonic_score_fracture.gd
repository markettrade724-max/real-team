extends Node

## Manages the dynamic fragmentation of the game's soundtrack based on Lyra's memory state.
## Each memory is associated with an AudioStreamPlayer node, allowing for individual control
## of volume and pitch to simulate identity unraveling.

@export var memory_player_map: Dictionary = {}
@export var fade_duration: float = 1.0
@export var warp_pitch_factor: float = 0.5
@export var warp_duration: float = 0.5

var _active_tweens: Dictionary = {}

func _ready() -> void:
	# Ensure all associated AudioStreamPlayers are initially playing and at normal state.
	for memory_id in memory_player_map:
		var player: AudioStreamPlayer = _get_player(memory_id)
		if player:
			player.volume_db = 0.0
			player.pitch_scale = 1.0
			if not player.playing:
				player.play()

func _get_player(memory_id: String) -> AudioStreamPlayer:
	var player_path: NodePath = memory_player_map.get(memory_id)
	if player_path:
		var player = get_node_or_null(player_path)
		if player and player is AudioStreamPlayer:
			return player
		else:
			push_error("MemoryScoreManager: NodePath '%s' for memory '%s' is not a valid AudioStreamPlayer." % [player_path, memory_id])
	else:
		push_warning("MemoryScoreManager: No AudioStreamPlayer mapped for memory ID '%s'." % memory_id)
	return null

## Fades out and optionally warps the audio layer associated with a lost memory.
func lose_memory(memory_id: String) -> void:
	var player: AudioStreamPlayer = _get_player(memory_id)
	if not player:
		return

	# Stop any existing tween for this player
	if _active_tweens.has(memory_id) and is_instance_valid(_active_tweens[memory_id]):
		_active_tweens[memory_id].kill()
		_active_tweens.erase(memory_id)

	var tween: Tween = create_tween()
	_active_tweens[memory_id] = tween

	# Warp pitch if factor is not 1.0
	if warp_pitch_factor != 1.0:
		tween.tween_property(player, "pitch_scale", warp_pitch_factor, warp_duration).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(player, "volume_db", -10.0, warp_duration).set_ease(Tween.EASE_OUT) # Slight dip before full fade

	# Fade out volume to silence
	tween.tween_property(player, "volume_db", -80.0, fade_duration).set_delay(warp_duration if warp_pitch_factor != 1.0 else 0.0).set_ease(Tween.EASE_IN)
	tween.tween_callback(player.stop)
	tween.tween_callback(func():
		if _active_tweens.has(memory_id):
			_active_tweens.erase(memory_id)
	)

## Fades in and optionally unwraps the audio layer associated with a restored memory.
func restore_memory(memory_id: String) -> void:
	var player: AudioStreamPlayer = _get_player(memory_id)
	if not player:
		return

	# Stop any existing tween for this player
	if _active_tweens.has(memory_id) and is_instance_valid(_active_tweens[memory_id]):
		_active_tweens[memory_id].kill()
		_active_tweens.erase(memory_id)

	var tween: Tween = create_tween()
	_active_tweens[memory_id] = tween

	# Ensure player is playing, starting from silent and warped state
	if not player.playing:
		player.volume_db = -80.0
		player.pitch_scale = warp_pitch_factor if warp_pitch_factor != 1.0 else 1.0
		player.play()

	# Unwarp pitch and fade in volume
	if warp_pitch_factor != 1.0:
		tween.tween_property(player, "pitch_scale", 1.0, warp_duration).set_ease(Tween.EASE_IN)
		tween.parallel().tween_property(player, "volume_db", 0.0, warp_duration).set_ease(Tween.EASE_IN)
	else:
		tween.tween_property(player, "volume_db", 0.0, fade_duration).set_ease(Tween.EASE_IN)

	tween.tween_callback(func():
		if _active_tweens.has(memory_id):
			_active_tweens.erase(memory_id)
	)
