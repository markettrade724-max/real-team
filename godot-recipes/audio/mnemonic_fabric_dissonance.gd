extends Node

@export var base_frequency: float = 100.0
@export var base_amplitude: float = 0.1
@export var silence_noise_amplitude: float = 0.05
@export var memory_integrity: float = 1.0: # 0.0 (lost) to 1.0 (intact)
	set(value):
		memory_integrity = clampf(value, 0.0, 1.0)
		_update_module_states()

var _audio_stream_generator: AudioStreamGenerator
var _playback: AudioStreamGeneratorPlayback
var _sample_rate: float = AudioServer.get_mix_rate()
var _global_phase: float = 0.0 # Global phase for shared effects

# Simple memory modules: each is a dictionary
# { "id": int, "frequency": float, "amplitude": float, "state": int, "phase": float }
# state: 0=intact, 1=degrading, 2=lost
var _memory_modules: Array[Dictionary] = []

func _ready() -> void:
	_initialize_audio_system()
	_setup_initial_memories()
	_update_module_states()

func _initialize_audio_system() -> void:
	_audio_stream_generator = AudioStreamGenerator.new()
	_audio_stream_generator.mix_rate = _sample_rate
	_audio_stream_generator.buffer_length = 0.05 # Small buffer for responsiveness
	
	var audio_player = AudioStreamPlayer.new()
	audio_player.stream = _audio_stream_generator
	add_child(audio_player)
	audio_player.play()
	
	_playback = audio_player.get_stream_playback() as AudioStreamGeneratorPlayback

func _setup_initial_memories() -> void:
	# Initialize some example memory modules
	_add_memory_module(0, 220.0, 0.08) # A3
	_add_memory_module(1, 330.0, 0.07) # E4
	_add_memory_module(2, 440.0, 0.06) # A4

func _add_memory_module(id: int, freq: float, amp: float) -> void:
	_memory_modules.append({"id": id, "frequency": freq, "amplitude": amp, "state": 0, "phase": 0.0})

func _update_module_states() -> void:
	# Updates the state of modules based on overall integrity.
	# This can be expanded to more complex logic.
	for module in _memory_modules:
		if memory_integrity >= 0.7:
			module.state = 0 # Intact
		elif memory_integrity >= 0.3:
			module.state = 1 # Degrading
		else:
			module.state = 2 # Lost (or heavily degraded)

func lose_specific_memory(id: int) -> void:
	# Marks a specific memory module as lost, overriding global integrity for it.
	for module in _memory_modules:
		if module.id == id:
			module.state = 2 # Mark as lost
			break

func _process(delta: float) -> void:
	# Continuously push audio buffers if playback is ready
	if _playback and _playback.can_push_buffer(_audio_stream_generator.buffer_length):
		var frames_to_fill: int = int(_audio_stream_generator.buffer_length * _sample_rate)
		var buffer: PackedVector2Array = PackedVector2Array()
		buffer.resize(frames_to_fill)
		_fill_buffer(buffer, frames_to_fill)
		_playback.push_buffer(buffer)

func _fill_buffer(buffer: PackedVector2Array, frames: int) -> void:
	# Synthesizes audio samples for the given buffer
	for i in range(frames):
		var sample_l: float = 0.0
		var sample_r: float = 0.0
		
		for module in _memory_modules:
			var current_freq: float = module.frequency
			var current_amp: float = module.amplitude
			
			match module.state:
				0: # Intact: Clean sine wave
					sample_l += sin(module.phase * 2.0 * PI) * current_amp
					sample_r += sin(module.phase * 2.0 * PI) * current_amp
				1: # Degrading: Wobbling sine, subtle low rumble
					var wobble_factor: float = sin(_global_phase * 0.5 * 2.0 * PI) * 0.05 + 1.0
					sample_l += sin(module.phase * 2.0 * PI * wobble_factor) * current_amp * 0.7
					sample_r += sin(module.phase * 2.0 * PI * wobble_factor) * current_amp * 0.7
					sample_l += sin(_global_phase * 5.0 * 2.0 * PI) * silence_noise_amplitude * 0.5
					sample_r += sin(_global_phase * 5.0 * 2.0 * PI) * silence_noise_amplitude * 0.5
				2: # Lost: White noise, prominent low drone
					sample_l += randf_range(-1.0, 1.0) * silence_noise_amplitude
					sample_r += randf_range(-1.0, 1.0) * silence_noise_amplitude
					sample_l += sin(_global_phase * 10.0 * 2.0 * PI) * silence_noise_amplitude * 1.5
					sample_r += sin(_global_phase * 10.0 * 2.0 * PI) * silence_noise_amplitude * 1.5
			
			# Advance module phase
			module.phase += current_freq / _sample_rate
			if module.phase >= 1.0:
				module.phase -= 1.0
		
		# Advance global phase for shared effects
		_global_phase += 1.0 / _sample_rate
		if _global_phase >= 1.0:
			_global_phase -= 1.0
			
		buffer[i] = Vector2(sample_l, sample_r)
