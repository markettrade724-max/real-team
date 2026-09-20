extends Node

@export var memory_soundscape_player: AudioStreamPlayer # Player for Lyra's internal sounds
@export var silence_hum_player: AudioStreamPlayer # Player for the Silence's hum

# Dictionary mapping memory_id (String) to AudioEffectEQ band index (int).
# Example: {"childhood_joy": 0, "first_love": 1, "lost_home": 2}
# Ensure these band indices correspond to the configured bands in your AudioEffectEQs.
@export var memory_band_map: Dictionary = {}

@export var memory_bus_name: String = "Memories_Bus"
@export var silence_bus_name: String = "Silence_Bus"

@export var memory_initial_gain_db: float = 0.0 # Initial gain for memory bands when present
@export var silence_initial_gain_db: float = -60.0 # Initial gain for silence bands (effectively off)
@export var memory_lost_gain_db: float = -60.0 # Gain for memory bands when lost
@export var silence_active_gain_db: float = 0.0 # Gain for silence bands when active

@export var transition_speed_db_per_sec: float = 20.0 # Speed of gain transition in dB per second

var _memory_bus_idx: int = -1
var _silence_bus_idx: int = -1
var _memory_eq_effect: AudioEffectEQ = null
var _silence_eq_effect: AudioEffectEQ = null

var _target_memory_gains: Dictionary = {} # Stores target gain for each memory band
var _target_silence_gains: Dictionary = {} # Stores target gain for each silence band

func _ready() -> void:
	_initialize_audio_buses()
	_initialize_gains()
	_start_audio_players()

func _initialize_audio_buses() -> void:
	_memory_bus_idx = AudioServer.get_bus_index(memory_bus_name)
	_silence_bus_idx = AudioServer.get_bus_index(silence_bus_name)

	if _memory_bus_idx == -1:
		push_error("AuralIdentityFracture: Memory bus '%s' not found! Check Project Settings -> Audio -> Buses." % memory_bus_name)
		set_process(false)
		return
	if _silence_bus_idx == -1:
		push_error("AuralIdentityFracture: Silence bus '%s' not found! Check Project Settings -> Audio -> Buses." % silence_bus_name)
		set_process(false)
		return

	# Assuming the first effect on each bus is the AudioEffectEQ
	if AudioServer.get_bus_effect_count(_memory_bus_idx) > 0:
		_memory_eq_effect = AudioServer.get_bus_effect(_memory_bus_idx, 0) as AudioEffectEQ
	if AudioServer.get_bus_effect_count(_silence_bus_idx) > 0:
		_silence_eq_effect = AudioServer.get_bus_effect(_silence_bus_idx, 0) as AudioEffectEQ

	if not _memory_eq_effect:
		push_error("AuralIdentityFracture: No AudioEffectEQ found on Memory bus '%s' at index 0. Add one in Project Settings." % memory_bus_name)
		set_process(false)
		return
	if not _silence_eq_effect:
		push_error("AuralIdentityFracture: No AudioEffectEQ found on Silence bus '%s' at index 0. Add one in Project Settings." % silence_bus_name)
		set_process(false)
		return

func _initialize_gains() -> void:
	for memory_id in memory_band_map:
		var band_idx = memory_band_map[memory_id]
		if band_idx < _memory_eq_effect.get_band_count():
			_memory_eq_effect.set_band_gain_db(band_idx, memory_initial_gain_db)
			_target_memory_gains[memory_id] = memory_initial_gain_db
		else:
			push_warning("AuralIdentityFracture: Memory '%s' mapped to band %d, but Memory EQ only has %d bands." % [memory_id, band_idx, _memory_eq_effect.get_band_count()])

		if band_idx < _silence_eq_effect.get_band_count():
			_silence_eq_effect.set_band_gain_db(band_idx, silence_initial_gain_db)
			_target_silence_gains[memory_id] = silence_initial_gain_db
		else:
			push_warning("AuralIdentityFracture: Memory '%s' mapped to band %d, but Silence EQ only has %d bands." % [memory_id, band_idx, _silence_eq_effect.get_band_count()])

func _start_audio_players() -> void:
	if memory_soundscape_player and not memory_soundscape_player.playing:
		memory_soundscape_player.play()
	if silence_hum_player and not silence_hum_player.playing:
		silence_hum_player.play()

func _process(delta: float) -> void:
	_update_band_gains(delta)

func _update_band_gains(delta: float) -> void:
	for memory_id in memory_band_map:
		var band_idx = memory_band_map[memory_id]

		# Update memory band gain
		var current_memory_gain = _memory_eq_effect.get_band_gain_db(band_idx)
		var target_memory_gain = _target_memory_gains.get(memory_id, memory_initial_gain_db)
		if not is_equal_approx(current_memory_gain, target_memory_gain):
			var new_gain = move_toward(current_memory_gain, target_memory_gain, transition_speed_db_per_sec * delta)
			_memory_eq_effect.set_band_gain_db(band_idx, new_gain)

		# Update silence band gain
		var current_silence_gain = _silence_eq_effect.get_band_gain_db(band_idx)
		var target_silence_gain = _target_silence_gains.get(memory_id, silence_initial_gain_db)
		if not is_equal_approx(current_silence_gain, target_silence_gain):
			var new_gain = move_toward(current_silence_gain, target_silence_gain, transition_speed_db_per_sec * delta)
			_silence_eq_effect.set_band_gain_db(band_idx, new_gain)

# Public function to trigger memory loss for a specific memory_id
func lose_memory(memory_id: String) -> void:
	if not memory_band_map.has(memory_id):
		push_warning("AuralIdentityFracture: Attempted to lose unknown memory ID: '%s'." % memory_id)
		return

	_target_memory_gains[memory_id] = memory_lost_gain_db
	_target_silence_gains[memory_id] = silence_active_gain_db

# Public function to restore a memory (if the game design allows)
func restore_memory(memory_id: String) -> void:
	if not memory_band_map.has(memory_id):
		push_warning("AuralIdentityFracture: Attempted to restore unknown memory ID: '%s'." % memory_id)
		return

	_target_memory_gains[memory_id] = memory_initial_gain_db
	_target_silence_gains[memory_id] = silence_initial_gain_db
