extends Node

# --- Parameters ---
@export_category("Audio Bus Configuration")
@export var ambience_bus_name: String = "Ambience"
@export var world_fx_bus_name: String = "WorldFX"
@export var silence_bus_name: String = "SilenceDisruption"

@export_category("Effect Indices (Adjust in Project Settings -> Audio -> Buses)")
@export var ambience_low_pass_idx: int = 0 # Index of AudioEffectLowPassFilter on Ambience bus
@export var ambience_eq_idx: int = 1 # Index of AudioEffectEQ on Ambience bus
@export var world_fx_distortion_idx: int = 0 # Index of AudioEffectDistortion on WorldFX bus
@export var silence_low_pass_idx: int = 0 # Index of AudioEffectLowPassFilter on SilenceDisruption bus
@export var silence_distortion_idx: int = 1 # Index of AudioEffectDistortion on SilenceDisruption bus

# --- Internal State ---
var _ambience_bus_idx: int = -1
var _world_fx_bus_idx: int = -1
var _silence_bus_idx: int = -1

var _ambience_low_pass_filter: AudioEffectLowPassFilter = null
var _world_fx_distortion: AudioEffectDistortion = null
var _ambience_eq: AudioEffectEQ = null
var _silence_low_pass_filter: AudioEffectLowPassFilter = null
var _silence_distortion: AudioEffectDistortion = null

func _ready() -> void:
	_initialize_audio_buses()

func _initialize_audio_buses() -> void:
	_ambience_bus_idx = AudioServer.get_bus_index(ambience_bus_name)
	_world_fx_bus_idx = AudioServer.get_bus_index(world_fx_bus_name)
	_silence_bus_idx = AudioServer.get_bus_index(silence_bus_name)

	if _ambience_bus_idx != -1:
		_ambience_low_pass_filter = AudioServer.get_bus_effect(_ambience_bus_idx, ambience_low_pass_idx) as AudioEffectLowPassFilter
		_ambience_eq = AudioServer.get_bus_effect(_ambience_bus_idx, ambience_eq_idx) as AudioEffectEQ
	if _world_fx_bus_idx != -1:
		_world_fx_distortion = AudioServer.get_bus_effect(_world_fx_bus_idx, world_fx_distortion_idx) as AudioEffectDistortion
	if _silence_bus_idx != -1:
		_silence_low_pass_filter = AudioServer.get_bus_effect(_silence_bus_idx, silence_low_pass_idx) as AudioEffectLowPassFilter
		_silence_distortion = AudioServer.get_bus_effect(_silence_bus_idx, silence_distortion_idx) as AudioEffectDistortion

	_validate_effects()

func _validate_effects() -> void:
	if not _ambience_low_pass_filter:
		push_warning("MnemonicSonarFeedback: LowPassFilter not found on Ambience bus at index %d." % ambience_low_pass_idx)
	if not _ambience_eq:
		push_warning("MnemonicSonarFeedback: EQ not found on Ambience bus at index %d." % ambience_eq_idx)
	if not _world_fx_distortion:
		push_warning("MnemonicSonarFeedback: Distortion not found on WorldFX bus at index %d." % world_fx_distortion_idx)
	if not _silence_low_pass_filter:
		push_warning("MnemonicSonarFeedback: LowPassFilter not found on SilenceDisruption bus at index %d." % silence_low_pass_idx)
	if not _silence_distortion:
		push_warning("MnemonicSonarFeedback: Distortion not found on SilenceDisruption bus at index %d." % silence_distortion_idx)

# Called by player/memory when a memory fragment is interacted with.
# integrity: 0.0 (lost/corrupted) to 1.0 (fully recovered).
func process_memory_interaction(integrity: float) -> void:
	_apply_memory_effect(integrity)

# Called by Silence entities to disrupt the soundscape.
# disruption_level: 0.0 (no disruption) to 1.0 (full disruption).
func apply_silence_disruption(disruption_level: float) -> void:
	_apply_disruption_effect(disruption_level)

func _apply_memory_effect(integrity: float) -> void:
	# Normalize integrity to a range for effect parameters
	var clarity_factor: float = integrity
	var dissonance_factor: float = 1.0 - integrity

	# Ambience Bus: Clarity/Loss
	if _ambience_low_pass_filter:
		# Lower cutoff for clarity (higher integrity), raise for muffled (lower integrity)
		_ambience_low_pass_filter.cutoff_hz = lerp(500.0, 20000.0, clarity_factor)
	if _ambience_eq:
		# Boost mids/highs for clarity, cut for loss
		_ambience_eq.set_band_gain(0, lerp(-12.0, 0.0, clarity_factor)) # Low-mid gain
		_ambience_eq.set_band_gain(1, lerp(-6.0, 3.0, clarity_factor)) # High-mid gain

	# WorldFX Bus: Glitch/Dissonance
	if _world_fx_distortion:
		# More distortion for dissonance, less for clarity
		_world_fx_distortion.set_mode(AudioEffectDistortion.MODE_OVERDRIVE)
		_world_fx_distortion.drive = lerp(0.0, 0.8, dissonance_factor)
		_world_fx_distortion.post_gain = lerp(0.0, -6.0, dissonance_factor) # Reduce volume slightly with distortion

func _apply_disruption_effect(disruption_level: float) -> void:
	# Silence disruption layers on top, typically on a dedicated 'SilenceDisruption' bus.
	if _silence_bus_idx != -1:
		if _silence_low_pass_filter:
			_silence_low_pass_filter.cutoff_hz = lerp(20000.0, 300.0, disruption_level)
		if _silence_distortion:
			_silence_distortion.drive = lerp(0.0, 0.9, disruption_level)
			_silence_distortion.post_gain = lerp(0.0, -12.0, disruption_level)
		# Adjust the overall volume of this bus to make the disruption more prominent.
		AudioServer.set_bus_volume_db(_silence_bus_idx, lerp(-80.0, 0.0, disruption_level))
