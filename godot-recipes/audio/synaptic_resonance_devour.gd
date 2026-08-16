extends Node

@export var identity_generator_resource: AudioStreamGenerator
@export var void_generator_resource: AudioStreamGenerator

@onready var identity_player: AudioStreamPlayer = $IdentityPlayer
@onready var void_player: AudioStreamPlayer = $VoidPlayer

const SAMPLE_RATE: int = 44100
const BUFFER_SIZE: int = 1024 # Samples per buffer fill
const MAX_MEMORIES: int = 8 # Max concurrent memory frequencies, ensure EQ has enough bands

var _identity_phases: Array[float] = [] # Stores phase for each memory's sine wave

var _memory_map: Dictionary = {} # { "memory_id": { "frequency": float, "eq_band": int, "active": bool } }
var _next_available_eq_band_idx: int = 0

var _lyra_identity_bus_idx: int = -1
var _void_resonance_bus_idx: int = -1

var _identity_eq_effect: AudioEffectEQ
var _identity_filter_effect: AudioEffectFilter
var _void_eq_effect: AudioEffectEQ

func _ready() -> void:
	_setup_audio_buses()
	_setup_generators()
	_initialize_phases()

	identity_player.play()
	void_player.play()
	void_player.volume_db = -80.0 # Void starts silent

func _setup_audio_buses() -> void:
	_lyra_identity_bus_idx = AudioServer.get_bus_index("LyraIdentity")
	_void_resonance_bus_idx = AudioServer.get_bus_index("VoidResonance")

	if _lyra_identity_bus_idx == -1 or _void_resonance_bus_idx == -1:
		push_error("Audio buses 'LyraIdentity' or 'VoidResonance' not found. Please create them in Project Settings -> Audio Bus Layout.")
		set_process(false)
		return

	# Assuming EQ is the first effect (index 0) and Filter is the second (index 1) on LyraIdentity bus
	_identity_eq_effect = AudioServer.get_bus_effect(_lyra_identity_bus_idx, 0) as AudioEffectEQ
	_identity_filter_effect = AudioServer.get_bus_effect(_lyra_identity_bus_idx, 1) as AudioEffectFilter
	_void_eq_effect = AudioServer.get_bus_effect(_void_resonance_bus_idx, 0) as AudioEffectEQ

	if not _identity_eq_effect or not _identity_filter_effect or not _void_eq_effect:
		push_error("Required AudioEffectEQ/AudioEffectFilter not found on buses. Ensure they are added at correct indices.")
		set_process(false)

func _setup_generators() -> void:
	identity_generator_resource.mix_rate = SAMPLE_RATE
	identity_generator_resource.buffer_length = float(BUFFER_SIZE) / SAMPLE_RATE
	identity_player.stream = identity_generator_resource
	identity_player.bus = "LyraIdentity"
	identity_generator_resource.connect("fill_buffer", Callable(self, "_fill_identity_buffer"))

	void_generator_resource.mix_rate = SAMPLE_RATE
	void_generator_resource.buffer_length = float(BUFFER_SIZE) / SAMPLE_RATE
	void_player.stream = void_generator_resource
	void_player.bus = "VoidResonance"
	void_generator_resource.connect("fill_buffer", Callable(self, "_fill_void_buffer"))

func _initialize_phases() -> void:
	for i in range(MAX_MEMORIES):
		_identity_phases.append(0.0)

func _fill_identity_buffer(buffer: AudioStreamGeneratorPlayback) -> void:
	var frames: PackedVector2Array = buffer.get_write_frames()
	for i in range(frames.size()):
		var sample_l: float = 0.0
		var sample_r: float = 0.0

		var memory_idx: int = 0
		for memory_id in _memory_map:
			var mem_data: Dictionary = _memory_map[memory_id]
			if mem_data.active:
				var freq: float = mem_data.frequency
				var phase_increment: float = (2.0 * PI * freq) / SAMPLE_RATE
				_identity_phases[memory_idx] = fmod(_identity_phases[memory_idx] + phase_increment, 2.0 * PI)
				var sine_val: float = sin(_identity_phases[memory_idx]) * 0.2
				sample_l += sine_val
				sample_r += sine_val
			memory_idx += 1

		frames[i] = Vector2(sample_l, sample_r)
	buffer.push_buffer(frames)

func _fill_void_buffer(buffer: AudioStreamGeneratorPlayback) -> void:
	var frames: PackedVector2Array = buffer.get_write_frames()
	for i in range(frames.size()):
		# Simple white noise for void sound
		var noise_val: float = randf_range(-1.0, 1.0) * 0.1
		frames[i] = Vector2(noise_val, noise_val)
	buffer.push_buffer(frames)

func add_memory_fragment(memory_id: String, frequency: float) -> void:
	if _memory_map.size() >= MAX_MEMORIES:
		push_warning("Cannot add more memories, MAX_MEMORIES reached. Increase MAX_MEMORIES or EQ bands.")
		return
	if _memory_map.has(memory_id):
		push_warning("Memory ID '%s' already exists." % memory_id)
		return

	var band_idx: int = _next_available_eq_band_idx
	if band_idx >= _identity_eq_effect.get_band_count():
		push_error("Not enough EQ bands available for new memory. Increase EQ bands or reduce MAX_MEMORIES.")
		return

	_next_available_eq_band_idx += 1

	_memory_map[memory_id] = {
		"frequency": frequency,
		"eq_band": band_idx,
		"active": true
	}
	# Initialize EQ bands for the new memory
	if _identity_eq_effect:
		_identity_eq_effect.set_band_gain_db(band_idx, 0.0) # Identity passes through initially
		_identity_eq_effect.set_band_frequency_hz(band_idx, frequency)
	if _void_eq_effect:
		_void_eq_effect.set_band_gain_db(band_idx, -80.0) # Void starts silent for this band
		_void_eq_effect.set_band_frequency_hz(band_idx, frequency)

func lose_memory_fragment(memory_id: String) -> void:
	if not _memory_map.has(memory_id):
		push_warning("Memory ID '%s' not found." % memory_id)
		return

	var mem_data: Dictionary = _memory_map[memory_id]
	if not mem_data.active:
		push_warning("Memory ID '%s' already lost." % memory_id)
		return

	mem_data.active = false
	_memory_map[memory_id] = mem_data # Update dictionary

	var band_idx: int = mem_data.eq_band
	if _identity_eq_effect:
		_identity_eq_effect.set_band_gain_db(band_idx, -24.0) # Surgically remove identity frequency
	if _void_eq_effect:
		_void_eq_effect.set_band_gain_db(band_idx, 12.0) # Boost void sound at this frequency
	
	# Gradually increase overall void player volume if not already prominent
	if void_player.volume_db < -10.0:
		var tween = create_tween()
		tween.tween_property(void_player, "volume_db", 0.0, 1.0).set_ease(Tween.EASE_OUT)

func update_silence_proximity(proximity_factor: float) -> void:
	# proximity_factor from 0.0 (far) to 1.0 (very close)
	# This affects a global filter on Lyra's identity soundscape
	if _identity_filter_effect:
		# Example: Silence distorts higher frequencies and adds resonance
		_identity_filter_effect.cutoff_hz = lerp(20000.0, 5000.0, proximity_factor)
		_identity_filter_effect.resonance = lerp(0.0, 0.5, proximity_factor)
		_identity_filter_effect.gain = lerp(1.0, 0.7, proximity_factor) # Slight overall gain reduction
	
	# Increase overall void presence as Silence gets closer
	void_player.volume_db = lerp(-80.0, 0.0, proximity_factor)
