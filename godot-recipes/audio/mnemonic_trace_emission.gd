extends Node3D

@export var echo_duration: float = 10.0
@export var decay_start_time: float = 3.0 # When distortion starts intensifying
@export var max_pitch_shift_factor: float = 0.7 # Max pitch scale (e.g., 0.7 means lower pitch)
@export var max_reverb_mix: float = 0.9 # Max reverb wet mix
@export var audio_bus_name: String = "Master"
@export var generator_buffer_size: int = 1024 # Number of frames the generator tries to keep in its buffer

var _audio_player: AudioStreamPlayer3D
var _audio_generator: AudioStreamGenerator
var _generator_playback: AudioStreamGeneratorPlayback
var _pitch_shift_effect: AudioEffectPitchShift
var _reverb_effect: AudioEffectReverb

var _source_frames: PackedVector2Array # Pre-processed frames from the memory fragment
var _source_frame_idx: int = 0

var _current_time: float = 0.0
var _is_active: bool = false

func _ready() -> void:
	_setup_audio_nodes()
	_setup_audio_effects()
	_configure_audio_bus()

func _setup_audio_nodes() -> void:
	_audio_player = AudioStreamPlayer3D.new()
	add_child(_audio_player)

	_audio_generator = AudioStreamGenerator.new()
	_audio_generator.mix_rate = AudioServer.get_mix_rate()
	_audio_generator.buffer_length = float(generator_buffer_size) / _audio_generator.mix_rate # Buffer length in seconds
	_audio_player.stream = _audio_generator

	_generator_playback = _audio_generator.get_playback()
	if _generator_playback == null:
		push_error("Failed to get AudioStreamGeneratorPlayback.")
		set_process(false)
		return

func _setup_audio_effects() -> void:
	_pitch_shift_effect = AudioEffectPitchShift.new()
	_pitch_shift_effect.set_pitch_scale(1.0) # Start at normal pitch

	_reverb_effect = AudioEffectReverb.new()
	_reverb_effect.set_mix(0.0) # Start with no reverb
	_reverb_effect.set_room_size(0.8)
	_reverb_effect.set_damping(0.5)

func _configure_audio_bus() -> void:
	var echo_bus_name = "EchoBus_%s" % get_instance_id()
	var bus_idx_echo = AudioServer.get_bus_index(echo_bus_name)
	if bus_idx_echo == -1:
		bus_idx_echo = AudioServer.add_bus(AudioServer.get_bus_count()) # Add at the end
		AudioServer.set_bus_name(bus_idx_echo, echo_bus_name)
		var target_bus_idx = AudioServer.get_bus_index(audio_bus_name)
		if target_bus_idx == -1:
			push_warning("Target audio bus '%s' not found. Sending echo to 'Master' bus." % audio_bus_name)
			target_bus_idx = AudioServer.get_bus_index("Master")
		AudioServer.set_bus_send(bus_idx_echo, AudioServer.get_bus_name(target_bus_idx)) # Send to specified or Master bus

	AudioServer.add_bus_effect(bus_idx_echo, _pitch_shift_effect, 0)
	AudioServer.add_bus_effect(bus_idx_echo, _reverb_effect, 1)
	_audio_player.bus = echo_bus_name

func _process(delta: float) -> void:
	if not _is_active:
		return

	_current_time += delta
	_update_effect_parameters()
	_generate_audio_frames()

	if _current_time >= echo_duration:
		_stop_echo()
		queue_free()

func _update_effect_parameters() -> void:
	var decay_progress: float = 0.0
	if _current_time > decay_start_time:
		decay_progress = (_current_time - decay_start_time) / (echo_duration - decay_start_time)
		decay_progress = clampf(decay_progress, 0.0, 1.0)

	# Pitch shift: gradually lower pitch
	var current_pitch_scale: float = lerpf(1.0, max_pitch_shift_factor, decay_progress)
	_pitch_shift_effect.set_pitch_scale(current_pitch_scale)

	# Reverb: gradually increase mix
	var current_reverb_mix: float = lerpf(0.0, max_reverb_mix, decay_progress)
	_reverb_effect.set_mix(current_reverb_mix)

	# Optional: gradually reduce volume
	_audio_player.volume_db = lerpf(0.0, -20.0, decay_progress) # Fade out volume

func _generate_audio_frames() -> void:
	if _source_frames.is_empty():
		return

	while _generator_playback.get_frames_available() > 0:
		var frame: Vector2 = _source_frames[_source_frame_idx]
		_generator_playback.push_frame(frame)
		_source_frame_idx = (_source_frame_idx + 1) % _source_frames.size()

func start_echo(memory_audio_frames: PackedVector2Array, position: Vector3) -> void:
	if memory_audio_frames.is_empty():
		push_warning("Cannot start echo with empty audio frames.")
		queue_free()
		return

	global_position = position
	_source_frames = memory_audio_frames
	_source_frame_idx = 0
	_current_time = 0.0
	_is_active = true
	_audio_player.play()

func _stop_echo() -> void:
	if _is_active:
		_is_active = false
		_audio_player.stop()
		# Clean up the dynamically created bus
		var bus_idx = AudioServer.get_bus_index(_audio_player.bus)
		if bus_idx != -1:
			AudioServer.remove_bus(bus_idx)

func _exit_tree() -> void:
	_stop_echo() # Ensure bus is cleaned up if node is removed prematurely

static func convert_wav_to_frames(audio_stream_wav: AudioStreamWAV) -> PackedVector2Array:
	var frames: PackedVector2Array
	if audio_stream_wav == null or audio_stream_wav.data.is_empty():
		return frames

	var data: PackedByteArray = audio_stream_wav.data
	var bits_per_sample: int = audio_stream_wav.bits_per_sample
	var stereo: bool = audio_stream_wav.stereo

	var bytes_per_sample: int = bits_per_sample / 8
	var frame_byte_size: int = bytes_per_sample * (2 if stereo else 1)
	var total_samples: int = data.size() / frame_byte_size

	for i in range(total_samples):
		var left_sample: float = 0.0
		var right_sample: float = 0.0

		var offset = i * frame_byte_size
		if bits_per_sample == 8:
			left_sample = float(data[offset]) / 128.0 - 1.0
			if stereo:
				right_sample = float(data[offset + bytes_per_sample]) / 128.0 - 1.0
		elif bits_per_sample == 16:
			var left_int: int = data.decode_s16(offset)
			left_sample = float(left_int) / 32768.0
			if stereo:
				var right_int: int = data.decode_s16(offset + bytes_per_sample)
				right_sample = float(right_int) / 32768.0
		elif bits_per_sample == 32: # Assuming float32
			var left_float: float = data.decode_float(offset)
			left_sample = left_float
			if stereo:
				var right_float: float = data.decode_float(offset + bytes_per_sample)
				right_sample = right_float
		else:
			push_warning("Unsupported bits_per_sample: %d for WAV conversion." % bits_per_sample)
			break

		frames.append(Vector2(left_sample, right_sample))
	return frames