extends Node

@export_range(0.0, 1.0, 0.01) var corruption_intensity: float = 0.0:
	set(value):
		corruption_intensity = clampf(value, 0.0, 1.0)
		_update_bus_effects()
		_update_generator_playback()

@export var target_bus_name: String = "Master"
@export var corruption_sound_volume_db: float = -15.0

const GENERATOR_BUFFER_SIZE: int = 1024
const GENERATOR_SAMPLE_RATE: int = 44100
const GENERATOR_FREQUENCY_BASE: float = 100.0
const GENERATOR_FREQUENCY_RANGE: float = 500.0
const GENERATOR_NOISE_FACTOR: float = 0.1

var _audio_bus_idx: int = -1
var _generator_player: AudioStreamPlayer
var _generator_stream: AudioStreamGenerator
var _generator_playback: AudioStreamGeneratorPlayback
var _current_phase: float = 0.0
var _current_freq: float = 0.0

func _ready() -> void:
	_audio_bus_idx = AudioServer.get_bus_index(target_bus_name)
	if _audio_bus_idx == -1:
		push_error("Target AudioBus '%s' not found." % target_bus_name)
		set_process(false)
		return

	_setup_generator_player()
	_update_bus_effects()
	_update_generator_playback()

func _process(delta: float) -> void:
	if _generator_playback and _generator_playback.can_push_buffer(GENERATOR_BUFFER_SIZE):
		_generate_corruption_audio()

func _setup_generator_player() -> void:
	_generator_player = AudioStreamPlayer.new()
	add_child(_generator_player)

	_generator_stream = AudioStreamGenerator.new()
	_generator_stream.mix_rate = GENERATOR_SAMPLE_RATE
	_generator_stream.buffer_length = 0.05 # Small buffer for responsiveness

	_generator_player.stream = _generator_stream
	_generator_player.bus = target_bus_name
	_generator_player.volume_db = corruption_sound_volume_db
	_generator_player.play()

	_generator_playback = _generator_player.get_stream_playback() as AudioStreamGeneratorPlayback
	_current_freq = GENERATOR_FREQUENCY_BASE

func _update_bus_effects() -> void:
	if _audio_bus_idx == -1:
		return

	# Remove existing corruption effects to re-apply
	for i in range(AudioServer.get_bus_effect_count(_audio_bus_idx) -1, -1, -1):
		var effect = AudioServer.get_bus_effect(_audio_bus_idx, i)
		if effect is AudioEffectDistortion or effect is AudioEffectPitchShift:
			AudioServer.remove_bus_effect(_audio_bus_idx, i)

	if corruption_intensity > 0.0:
		# Add/configure Distortion
		var distortion_effect = AudioEffectDistortion.new()
		distortion_effect.mode = AudioEffectDistortion.MODE_OVERDRIVE
		distortion_effect.pre_gain = lerpf(0.0, 10.0, corruption_intensity)
		distortion_effect.post_gain = lerpf(0.0, 0.5, corruption_intensity)
		distortion_effect.drive = lerpf(0.0, 0.8, corruption_intensity)
		AudioServer.add_bus_effect(_audio_bus_idx, distortion_effect)

		# Add/configure PitchShift
		var pitch_shift_effect = AudioEffectPitchShift.new()
		pitch_shift_effect.pitch_scale = lerpf(1.0, 0.5, corruption_intensity) # Lower pitch for unsettling effect
		AudioServer.add_bus_effect(_audio_bus_idx, pitch_shift_effect)

func _update_generator_playback() -> void:
	if _generator_player:
		_generator_player.volume_db = corruption_sound_volume_db + lerpf(-20.0, 0.0, corruption_intensity)
		_generator_player.pitch_scale = lerpf(1.0, 0.7, corruption_intensity)

func _generate_corruption_audio() -> void:
	var frames: PackedVector2Array
	frames.resize(GENERATOR_BUFFER_SIZE)

	for i in range(GENERATOR_BUFFER_SIZE):
		# Modulate frequency based on intensity and some randomness
		_current_freq = lerpf(_current_freq, GENERATOR_FREQUENCY_BASE + randf() * GENERATOR_FREQUENCY_RANGE * corruption_intensity, 0.01)
		_current_phase += _current_freq * TAU / GENERATOR_SAMPLE_RATE

		var sample: float = sin(_current_phase) * (1.0 - GENERATOR_NOISE_FACTOR)
		sample += (randf() * 2.0 - 1.0) * GENERATOR_NOISE_FACTOR * corruption_intensity # Add noise

		# Apply intensity to overall volume of generated sound
		sample *= corruption_intensity

		frames[i] = Vector2(sample, sample) # Stereo

	_generator_playback.push_buffer(frames)

func set_corruption_intensity(value: float) -> void:
	corruption_intensity = value
