extends Node

@export_range(0.0, 1.0, 0.01) var memory_loss_level: float = 0.0:
	set(value):
		memory_loss_level = clampf(value, 0.0, 1.0)
		_update_audio_effects()

@export var bus_name: String = "VoidHumBus"
@export var base_hum_frequency: float = 80.0
@export var hum_frequency_range: float = 120.0
@export var hum_amplitude_mod_speed: float = 2.0
@export var hum_frequency_mod_speed: float = 1.5
@export var dissonance_factor: float = 0.05
@export var max_eq_gain_db: float = 6.0
@export var min_filter_cutoff_hz: float = 200.0
@export var max_filter_cutoff_hz: float = 8000.0
@export var filter_resonance: float = 0.5

var _audio_player: AudioStreamPlayer
var _audio_stream_generator: AudioStreamGenerator
var _playback: AudioStreamGeneratorPlayback
var _phase: float = 0.0
var _sample_rate: int
var _bus_idx: int = -1
var _eq_effect_idx: int = -1
var _filter_effect_idx: int = -1

func _ready() -> void:
	_sample_rate = AudioServer.get_mix_rate()
	_setup_audio_bus()
	_setup_audio_player()
	_update_audio_effects()

func _setup_audio_bus() -> void:
	_bus_idx = AudioServer.get_bus_index(bus_name)
	if _bus_idx == -1:
		AudioServer.add_bus(AudioServer.get_bus_count())
		_bus_idx = AudioServer.get_bus_count() - 1
		AudioServer.set_bus_name(_bus_idx, bus_name)
		AudioServer.set_bus_send(_bus_idx, "Master")

	var eq_effect_found: bool = false
	var filter_effect_found: bool = false

	for i in range(AudioServer.get_bus_effect_count(_bus_idx)):
		var effect = AudioServer.get_bus_effect(_bus_idx, i)
		if effect is AudioEffectEQ:
			_eq_effect_idx = i
			eq_effect_found = true
		elif effect is AudioEffectFilter:
			_filter_effect_idx = i
			filter_effect_found = true
		if eq_effect_found and filter_effect_found:
			break

	if not eq_effect_found:
		var eq_effect = AudioEffectEQ10.new()
		eq_effect.set_band_gain_db(0, -6.0)
		eq_effect.set_band_gain_db(2, 3.0)
		eq_effect.set_band_gain_db(4, 6.0)
		eq_effect.set_band_gain_db(6, 3.0)
		eq_effect.set_band_gain_db(9, -3.0)
		AudioServer.add_bus_effect(_bus_idx, eq_effect)
		_eq_effect_idx = AudioServer.get_bus_effect_count(_bus_idx) - 1

	if not filter_effect_found:
		var filter_effect = AudioEffectFilter.new()
		filter_effect.filter_type = AudioEffectFilter.FILTER_LOWPASS
		filter_effect.resonance = filter_resonance
		AudioServer.add_bus_effect(_bus_idx, filter_effect)
		_filter_effect_idx = AudioServer.get_bus_effect_count(_bus_idx) - 1

func _setup_audio_player() -> void:
	_audio_player = AudioStreamPlayer.new()
	add_child(_audio_player)
	_audio_stream_generator = AudioStreamGenerator.new()
	_audio_stream_generator.mix_rate = _sample_rate
	_audio_stream_generator.buffer_length = 0.05
	_audio_player.stream = _audio_stream_generator
	_audio_player.bus = bus_name
	_audio_player.autoplay = true
	_audio_player.play()
	_playback = _audio_player.get_stream_playback()

func _process(delta: float) -> void:
	if not _playback or not _playback.is_playing():
		return

	var frames_to_push: int = _playback.get_frames_available()
	if frames_to_push > 0:
		var buffer: PackedVector2Array = PackedVector2Array()
		buffer.resize(frames_to_push)

		for i in range(frames_to_push):
			var time: float = _phase / _sample_rate
			
			var am_mod: float = sin(time * hum_amplitude_mod_speed * PI * 2.0) * 0.5 + 0.5
			
			var fm_mod: float = sin(time * hum_frequency_mod_speed * PI * 2.0) * 0.5 + 0.5
			var current_frequency: float = base_hum_frequency + (fm_mod * hum_frequency_range * memory_loss_level)
			
			var dissonant_frequency: float = current_frequency * (1.0 + dissonance_factor * memory_loss_level)
			
			var sample_value: float = (sin(_phase * current_frequency * PI * 2.0 / _sample_rate) + \
			                           sin(_phase * dissonant_frequency * PI * 2.0 / _sample_rate)) * 0.5 * am_mod * memory_loss_level
			
			buffer[i] = Vector2(sample_value, sample_value)
			_phase += 1.0
		
		_playback.push_buffer(buffer)

func _update_audio_effects() -> void:
	if _bus_idx == -1 or _eq_effect_idx == -1 or _filter_effect_idx == -1:
		return

	var eq_effect = AudioServer.get_bus_effect(_bus_idx, _eq_effect_idx)
	if eq_effect is AudioEffectEQ10:
		var eq_gain_factor: float = memory_loss_level * max_eq_gain_db
		eq_effect.set_band_gain_db(2, 3.0 + eq_gain_factor * 0.5)
		eq_effect.set_band_gain_db(4, 6.0 + eq_gain_factor)
		eq_effect.set_band_gain_db(6, 3.0 + eq_gain_factor * 0.5)

	var filter_effect = AudioServer.get_bus_effect(_bus_idx, _filter_effect_idx)
	if filter_effect is AudioEffectFilter:
		var cutoff: float = lerpf(max_filter_cutoff_hz, min_filter_cutoff_hz, memory_loss_level)
		filter_effect.cutoff_hz = cutoff
		filter_effect.resonance = clampf(filter_resonance + (memory_loss_level * 1.0), 0.0, 1.0)
