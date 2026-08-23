extends Node

# --- Exported Parameters ---
@export_range(0.1, 5.0, 0.1) var feedback_duration: float = 0.8
@export_range(-24.0, 0.0, 1.0) var silence_gain_db: float = -18.0
@export_range(-24.0, 0.0, 1.0) var silence_eq_band_gain: float = -12.0 # Gain for a specific EQ band
@export var silence_eq_band_idx: int = 4 # Mid-range band index (adjust based on desired frequency)
@export_range(0.0, 1.0, 0.05) var feedback_distortion_mix: float = 0.7
@export_range(0.5, 2.0, 0.05) var feedback_pitch_shift: float = 1.5
@export_range(0.0, 12.0, 1.0) var feedback_gain_peak_db: float = 6.0

# --- Internal State ---
var _memory_bus_map: Dictionary = {} # {bus_name: {player: AudioStreamPlayer, bus_idx: int}}

# --- Public API ---

func register_memory_sound(audio_player: AudioStreamPlayer, unique_bus_name: String) -> void:
	# Ensure the bus exists and is configured with necessary effects
	var bus_idx = _ensure_bus_exists(unique_bus_name)
	if bus_idx == -1:
		push_error("Failed to create or find audio bus: ", unique_bus_name)
		return

	audio_player.bus = unique_bus_name
	_memory_bus_map[unique_bus_name] = {"player": audio_player, "bus_idx": bus_idx}
	_apply_silence_effects(unique_bus_name)

func trigger_recollection_feedback(unique_bus_name: String) -> void:
	if not _memory_bus_map.has(unique_bus_name):
		push_warning("Attempted to trigger feedback on unregistered bus: ", unique_bus_name)
		return

	var bus_idx = _memory_bus_map[unique_bus_name].bus_idx
	var eq_effect: AudioEffectEQ = _get_bus_effect(bus_idx, AudioEffectEQ)
	var dist_effect: AudioEffectDistortion = _get_bus_effect(bus_idx, AudioEffectDistortion)
	var pitch_effect: AudioEffectPitchShift = _get_bus_effect(bus_idx, AudioEffectPitchShift)
	var gain_effect: AudioEffectGain = _get_bus_effect(bus_idx, AudioEffectGain)

	if not (eq_effect and dist_effect and pitch_effect and gain_effect):
		push_error("Missing required audio effects on bus: ", unique_bus_name)
		return

	var tween = create_tween()
	tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

	# Ramp up feedback
	tween.tween_property(eq_effect, "band_gains/%d" % silence_eq_band_idx, 0.0, feedback_duration / 2.0)
	tween.tween_property(dist_effect, "mix", feedback_distortion_mix, feedback_duration / 2.0)
	tween.tween_property(pitch_effect, "pitch_scale", feedback_pitch_shift, feedback_duration / 2.0)
	tween.tween_property(gain_effect, "gain_db", feedback_gain_peak_db, feedback_duration / 2.0)

	# Ramp down feedback and re-apply silence
	tween.tween_property(eq_effect, "band_gains/%d" % silence_eq_band_idx, silence_eq_band_gain, feedback_duration / 2.0)
	tween.tween_property(dist_effect, "mix", 0.0, feedback_duration / 2.0)
	tween.tween_property(pitch_effect, "pitch_scale", 1.0, feedback_duration / 2.0)
	tween.tween_property(gain_effect, "gain_db", silence_gain_db, feedback_duration / 2.0)

# --- Internal Helpers ---

func _ensure_bus_exists(bus_name: String) -> int:
	var bus_idx = AudioServer.get_bus_index(bus_name)
	if bus_idx == -1:
		AudioServer.add_bus(AudioServer.get_bus_count()) # Add bus at the end
		bus_idx = AudioServer.get_bus_count() - 1
		AudioServer.set_bus_name(bus_idx, bus_name)
		AudioServer.set_bus_send(bus_idx, "Master") # Route to Master by default

		# Add required effects if they don't exist
		_add_effect_to_bus(bus_idx, AudioEffectEQ.new())
		_add_effect_to_bus(bus_idx, AudioEffectDistortion.new())
		_add_effect_to_bus(bus_idx, AudioEffectPitchShift.new())
		_add_effect_to_bus(bus_idx, AudioEffectGain.new())

	return bus_idx

func _add_effect_to_bus(bus_idx: int, effect: AudioEffect) -> void:
	# Only add if an effect of this type isn't already present
	if not _get_bus_effect(bus_idx, effect.get_class()):
		AudioServer.add_bus_effect(bus_idx, effect)
		# Initial setup for effects
		if effect is AudioEffectDistortion:
			effect.mode = AudioEffectDistortion.MODE_CLIP
			effect.mix = 0.0
		elif effect is AudioEffectPitchShift:
			effect.pitch_scale = 1.0
		elif effect is AudioEffectGain:
			effect.gain_db = 0.0

func _apply_silence_effects(unique_bus_name: String) -> void:
	var bus_idx = _memory_bus_map[unique_bus_name].bus_idx
	var eq_effect: AudioEffectEQ = _get_bus_effect(bus_idx, AudioEffectEQ)
	var gain_effect: AudioEffectGain = _get_bus_effect(bus_idx, AudioEffectGain)
	var dist_effect: AudioEffectDistortion = _get_bus_effect(bus_idx, AudioEffectDistortion)
	var pitch_effect: AudioEffectPitchShift = _get_bus_effect(bus_idx, AudioEffectPitchShift)

	if eq_effect:
		eq_effect.band_gains[silence_eq_band_idx] = silence_eq_band_gain
	if gain_effect:
		gain_effect.gain_db = silence_gain_db
	if dist_effect:
		dist_effect.mix = 0.0 # Ensure distortion is off
	if pitch_effect:
		pitch_effect.pitch_scale = 1.0 # Ensure pitch is normal

func _get_bus_effect(bus_idx: int, effect_type: GDScript) -> AudioEffect:
	for i in range(AudioServer.get_bus_effect_count(bus_idx)):
		var effect = AudioServer.get_bus_effect(bus_idx, i)
		if effect is effect_type:
			return effect
	return null
