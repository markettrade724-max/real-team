extends Node

@export var transition_speed_db_per_sec: float = 10.0
@export var transition_speed_eq_per_sec: float = 10.0

# Dictionary to store memory-linked audio states and their target values.
# Each key is a unique memory ID (String).
# Each value is a Dictionary containing:
#   - bus_name: The name of the Audio Bus in Project Settings (String).
#   - bus_idx: The runtime index of the Audio Bus (int, populated in _ready).
#   - eq_effect_idx: The index of the AudioEffectEQ on the bus (int).
#   - eq_band_to_filter: The specific band index within the EQ effect to manipulate (int).
#   - initial_volume_db: The volume (dB) when memory is intact (float).
#   - desaturated_volume_db: The volume (dB) when memory is lost (float).
#   - initial_eq_gain_db: The EQ band gain (dB) when memory is intact (float).
#   - desaturated_eq_gain_db: The EQ band gain (dB) when memory is lost (float).
#   - current_volume_db: The actively interpolated volume (float).
#   - current_eq_gain_db: The actively interpolated EQ gain (float).
#   - is_desaturated: True if the memory is currently lost/fading (bool).
var memory_audio_states: Dictionary = {
	"childhood_melody": {
		"bus_name": "Music_Layer_A",
		"bus_idx": -1,
		"eq_effect_idx": 0,
		"eq_band_to_filter": 1, # Example: target mid-range band
		"initial_volume_db": 0.0,
		"desaturated_volume_db": -20.0,
		"initial_eq_gain_db": 0.0,
		"desaturated_eq_gain_db": -10.0,
		"current_volume_db": 0.0,
		"current_eq_gain_db": 0.0,
		"is_desaturated": false
	},
	"first_contact_sfx": {
		"bus_name": "SFX_Memory_Echo",
		"bus_idx": -1,
		"eq_effect_idx": 0,
		"eq_band_to_filter": 0, # Example: target low-end band
		"initial_volume_db": -5.0,
		"desaturated_volume_db": -30.0,
		"initial_eq_gain_db": 0.0,
		"desaturated_eq_gain_db": -15.0,
		"current_volume_db": -5.0,
		"current_eq_gain_db": 0.0,
		"is_desaturated": false
	}
}

func _ready() -> void:
	for memory_id in memory_audio_states:
		var state = memory_audio_states[memory_id]
		state.bus_idx = AudioServer.get_bus_index(state.bus_name)
		if state.bus_idx == -1:
			push_error("Audio Bus '" + state.bus_name + "' not found for memory '" + memory_id + "'.")
			continue
		# Initialize current values to initial values
		state.current_volume_db = state.initial_volume_db
		state.current_eq_gain_db = state.initial_eq_gain_db
		_apply_audio_state(memory_id)

func _process(delta: float) -> void:
	for memory_id in memory_audio_states:
		var state = memory_audio_states[memory_id]
		if state.bus_idx == -1: continue

		var target_volume = state.desaturated_volume_db if state.is_desaturated else state.initial_volume_db
		var target_eq_gain = state.desaturated_eq_gain_db if state.is_desaturated else state.initial_eq_gain_db

		state.current_volume_db = lerp(state.current_volume_db, target_volume, delta * transition_speed_db_per_sec)
		state.current_eq_gain_db = lerp(state.current_eq_gain_db, target_eq_gain, delta * transition_speed_eq_per_sec)

		_apply_audio_state(memory_id)

func _apply_audio_state(memory_id: String) -> void:
	var state = memory_audio_states[memory_id]
	var bus_idx = state.bus_idx
	if bus_idx == -1: return

	AudioServer.set_bus_volume_db(bus_idx, state.current_volume_db)

	var effect = AudioServer.get_bus_effect(bus_idx, state.eq_effect_idx)
	if effect is AudioEffectEQ:
		effect.set_band_gain_db(state.eq_band_to_filter, state.current_eq_gain_db)

func desaturate_memory(memory_id: String) -> void:
	if memory_audio_states.has(memory_id):
		memory_audio_states[memory_id].is_desaturated = true

func restore_memory(memory_id: String) -> void:
	if memory_audio_states.has(memory_id):
		memory_audio_states[memory_id].is_desaturated = false
