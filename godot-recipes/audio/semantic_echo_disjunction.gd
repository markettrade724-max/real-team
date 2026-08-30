extends Node

class_name SemanticEchoDisjunction

@export var memory_shards: Array[AudioStreamWAV]
@export var bus_name: String = "Master"
@export_range(0.1, 5.0, 0.1) var buffer_size_seconds: float = 0.5
@export_range(0.0, 1.0, 0.01) var corruption_intensity: float = 0.0:
	set(value):
		_set_corruption_intensity(value)

var _audio_player: AudioStreamPlayer
var _generator_stream: AudioStreamGenerator
var _current_shard_data: PackedVector2Array
var _current_shard_pos: int = 0
var _current_shard_length: int = 0
var _is_playing_shard: bool = false

func _ready():
	_audio_player = AudioStreamPlayer.new()
	add_child(_audio_player)

	_generator_stream = AudioStreamGenerator.new()
	_generator_stream.buffer_length = buffer_size_seconds
	_generator_stream.mix_rate = AudioServer.get_mix_rate()
	_audio_player.stream = _generator_stream
	_audio_player.bus = bus_name

	_generator_stream.connect("fill_buffer", Callable(self, "_fill_buffer"))
	_set_corruption_intensity(corruption_intensity)

func _fill_buffer():
	if not _is_playing_shard or _current_shard_data.is_empty():
		return

	var frames_to_fill = _generator_stream.get_frames_available()
	var new_buffer = PackedVector2Array()
	new_buffer.resize(frames_to_fill)

	for i in range(frames_to_fill):
		if _current_shard_pos >= _current_shard_length:
			_is_playing_shard = false
			_audio_player.stop()
			break

		new_buffer[i] = _current_shard_data[_current_shard_pos]
		_current_shard_pos += 1
	
	if not new_buffer.is_empty():
		_generator_stream.push_buffer(new_buffer)

func play_corrupted_shard(shard_index: int, intensity: float = -1.0):
	if shard_index < 0 or shard_index >= memory_shards.size():
		push_error("Invalid memory shard index: ", shard_index)
		return

	var shard_audio_stream: AudioStreamWAV = memory_shards[shard_index]
	if not shard_audio_stream:
		push_error("Memory shard at index ", shard_index, " is not loaded.")
		return

	_current_shard_data = shard_audio_stream.get_data()
	_current_shard_length = _current_shard_data.size()
	_current_shard_pos = 0
	_is_playing_shard = true

	if intensity >= 0.0:
		self.corruption_intensity = intensity
	else:
		_set_corruption_intensity(corruption_intensity)

	_audio_player.play()

func stop_playback():
	_is_playing_shard = false
	_audio_player.stop()
	_current_shard_data = PackedVector2Array()

func _set_corruption_intensity(intensity: float):
	corruption_intensity = clampf(intensity, 0.0, 1.0)
	var bus_idx = AudioServer.get_bus_index(bus_name)
	if bus_idx == -1:
		push_error("Audio bus '", bus_name, "' not found. Please configure it in Project Settings -> Audio -> Buses.")
		return

	for i in range(AudioServer.get_bus_effect_count(bus_idx)):
		var effect = AudioServer.get_bus_effect(bus_idx, i)
		if effect is AudioEffectPitchShift:
			var pitch_effect: AudioEffectPitchShift = effect
			pitch_effect.set_pitch_shift(1.0 + (corruption_intensity * 0.5) - (corruption_intensity * 0.25))
		elif effect is AudioEffectDistortion:
			var distortion_effect: AudioEffectDistortion = effect
			distortion_effect.set_drive(corruption_intensity * 0.8)
			distortion_effect.set_pre_gain(corruption_intensity * 6.0)
		elif effect is AudioEffectFilter:
			var filter_effect: AudioEffectFilter = effect
			filter_effect.set_cutoff(20000.0 - (corruption_intensity * 18000.0))
			filter_effect.set_resonance(corruption_intensity * 0.8)
