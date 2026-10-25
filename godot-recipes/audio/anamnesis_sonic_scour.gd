extends Node

# The name of the AudioBus dedicated to memory resonance.
@export var memory_bus_name: String = "MemoryResonance"
# The index of the AudioEffectEQ on the memory_bus_name.
# Ensure an AudioEffectEQ is present on the specified bus in Project Settings -> Audio -> Buses.
@export var eq_effect_index: int = 0
# Duration for gain transitions when memories are lost or recovered.
@export var tween_duration: float = 1.0
# The maximum decibel reduction when a memory is fully lost.
@export var max_gain_reduction_db: float = -24.0

# Maps memory_id (String) to band_index (int) within the AudioEffectEQ.
var _memory_band_map: Dictionary = {}
# Stores the initial gain (dB) for each registered memory band.
var _memory_initial_gains: Dictionary = {}
# Stores active Tweens for each memory_id to manage transitions.
var _active_tweens: Dictionary = {}

var _memory_eq_effect: AudioEffectEQ = null
var _bus_idx: int = -1

func _ready() -> void:
	_bus_idx = AudioServer.get_bus_index(memory_bus_name)
	if _bus_idx == -1:
		push_error("AudioBus '%s' not found. Please create it in Project Settings -> Audio -> Buses." % memory_bus_name)
		set_process(false)
		return

	_memory_eq_effect = _get_eq_effect()
	if not _memory_eq_effect:
		push_error("AudioEffectEQ not found at index %d on bus '%s'. Please add one." % [eq_effect_index, memory_bus_name])
		set_process(false)
		return

func register_memory_band(memory_id: String, band_index: int, initial_gain_db: float = 0.0) -> void:
	if not _memory_eq_effect:
		push_error("Cannot register memory band: AudioEffectEQ not initialized.")
		return

	if band_index < 0 or band_index >= _memory_eq_effect.get_band_count():
		push_error("Band index %d out of range for AudioEffectEQ (0-%d)." % [band_index, _memory_eq_effect.get_band_count() - 1])
		return

	_memory_band_map[memory_id] = band_index
	_memory_initial_gains[memory_id] = initial_gain_db
	_memory_eq_effect.set_band_gain_db(band_index, initial_gain_db)

func lose_memory(memory_id: String) -> void:
	if not _memory_band_map.has(memory_id):
		push_warning("Attempted to lose unregistered memory: %s" % memory_id)
		return
	_tween_band_gain(memory_id, max_gain_reduction_db)

func recover_memory(memory_id: String) -> void:
	if not _memory_band_map.has(memory_id):
		push_warning("Attempted to recover unregistered memory: %s" % memory_id)
		return
	_tween_band_gain(memory_id, _memory_initial_gains[memory_id])

func threaten_memory(memory_id: String, intensity: float = 0.5) -> void:
	if not _memory_band_map.has(memory_id):
		push_warning("Attempted to threaten unregistered memory: %s" % memory_id)
		return

	var initial_gain: float = _memory_initial_gains[memory_id]
	# Calculate target gain based on intensity (0.0 = no threat, 1.0 = full loss)
	var target_gain: float = initial_gain + (max_gain_reduction_db - initial_gain) * clampf(intensity, 0.0, 1.0)
	_tween_band_gain(memory_id, target_gain)

func _get_eq_effect() -> AudioEffectEQ:
	if _bus_idx == -1:
		return null
	var effect: AudioEffect = AudioServer.get_bus_effect(_bus_idx, eq_effect_index)
	if effect is AudioEffectEQ:
		return effect
	return null

func _tween_band_gain(memory_id: String, target_gain_db: float) -> void:
	if not _memory_eq_effect:
		return

	var band_index: int = _memory_band_map[memory_id]
	var current_gain: float = _memory_eq_effect.get_band_gain_db(band_index)

	if is_equal_approx(current_gain, target_gain_db):
		return # Already at target gain

	if _active_tweens.has(memory_id) and is_instance_valid(_active_tweens[memory_id]):
		_active_tweens[memory_id].kill()

	var tween: Tween = create_tween()
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_SINE)
	tween.tween_property(_memory_eq_effect, "band_gains_db/%d" % band_index, target_gain_db, tween_duration)
	tween.finished.connect(func(): _active_tweens.erase(memory_id))
	_active_tweens[memory_id] = tween