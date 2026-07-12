extends Node

@export var memory_bus_map: Dictionary = {
	"childhood_melody": "MemoryBus_Childhood",
	"bravery_theme": "MemoryBus_Bravery",
	"love_motif": "MemoryBus_Love"
} # Maps memory IDs to AudioBus names
@export var decay_duration: float = 2.0 # Duration for the decay animation
@export var decay_volume_target: float = -60.0 # Target volume in dB (effectively silent)
@export var decay_lp_filter_freq: float = 500.0 # Target low-pass filter cutoff frequency in Hz
@export var decay_distortion_mix: float = 0.8 # Target distortion mix (0.0 to 1.0)

var _bus_indices: Dictionary = {} # Internal map: memory_id -> bus_index
var _active_tweens: Dictionary = {} # Internal map: bus_index -> Tween

func _ready() -> void:
	_initialize_bus_mapping()

func _initialize_bus_mapping() -> void:
	for memory_id in memory_bus_map:
		var bus_name: String = memory_bus_map[memory_id]
		var bus_index: int = AudioServer.get_bus_index(bus_name)
		if bus_index != -1:
			_bus_indices[memory_id] = bus_index
		else:
			push_warning("AudioBus '%s' for memory ID '%s' not found. Please ensure it exists in Project Settings -> Audio -> Buses." % [bus_name, memory_id])

func lose_memory(memory_id: String) -> void:
	if not _bus_indices.has(memory_id):
		push_warning("Memory ID '%s' not mapped to an AudioBus. Cannot decay." % memory_id)
		return

	var bus_index: int = _bus_indices[memory_id]

	if _active_tweens.has(bus_index) and is_instance_valid(_active_tweens[bus_index]):
		_active_tweens[bus_index].kill()

	var tween: Tween = create_tween()
	_active_tweens[bus_index] = tween

	# Tween volume
	tween.tween_method(
		func(value: float): AudioServer.set_bus_volume_db(bus_index, value),
		AudioServer.get_bus_volume_db(bus_index),
		decay_volume_target,
		decay_duration
	)

	# Tween LowPassFilter
	var lp_filter_idx: int = _get_effect_index(bus_index, AudioEffectLowPassFilter)
	if lp_filter_idx != -1:
		tween.tween_method(
			func(value: float): AudioServer.bus_set_effect_param(bus_index, lp_filter_idx, "cutoff_hz", value),
			AudioServer.bus_get_effect_param(bus_index, lp_filter_idx, "cutoff_hz"),
			decay_lp_filter_freq,
			decay_duration
		)
	else:
		push_warning("AudioEffectLowPassFilter not found on bus index %d. Cannot apply low-pass decay." % bus_index)

	# Tween Distortion
	var distortion_idx: int = _get_effect_index(bus_index, AudioEffectDistortion)
	if distortion_idx != -1:
		tween.tween_method(
			func(value: float): AudioServer.bus_set_effect_param(bus_index, distortion_idx, "mix", value),
			AudioServer.bus_get_effect_param(bus_index, distortion_idx, "mix"),
			decay_distortion_mix,
			decay_duration
		)
	else:
		push_warning("AudioEffectDistortion not found on bus index %d. Cannot apply distortion decay." % bus_index)

	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tween.finished.connect(func(): _active_tweens.erase(bus_index))

func _get_effect_index(bus_index: int, effect_type: int) -> int:
	for i in range(AudioServer.bus_get_effect_count(bus_index)):
		var effect: AudioEffect = AudioServer.bus_get_effect(bus_index, i)
		if effect is effect_type:
			return i
	return -1
