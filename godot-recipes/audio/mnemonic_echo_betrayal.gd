extends Node

class_name MnemonicEchoBetrayalSystem

const ECHO_BUS_NAME = "MnemonicEchoBus"
const ECHO_BUS_INDEX = 1

var _active_echoes: Dictionary = {}

func _ready() -> void:
	_setup_echo_audio_bus()

func _setup_echo_audio_bus() -> void:
	var bus_idx = AudioServer.get_bus_index(ECHO_BUS_NAME)
	if bus_idx == -1:
		AudioServer.add_bus(ECHO_BUS_INDEX)
		AudioServer.set_bus_name(ECHO_BUS_INDEX, ECHO_BUS_NAME)
		AudioServer.set_bus_send(ECHO_BUS_INDEX, "Master")

		var granular_effect = AudioEffectGranular.new()
		granular_effect.set_parameter(AudioEffectGranular.PARAM_RATE, 0.5)
		granular_effect.set_parameter(AudioEffectGranular.PARAM_JITTER, 0.2)
		AudioServer.add_bus_effect(ECHO_BUS_INDEX, granular_effect, 0)

		var pitch_shift_effect = AudioEffectPitchShift.new()
		pitch_shift_effect.set_parameter(AudioEffectPitchShift.PARAM_PITCH_SCALE, 0.7)
		AudioServer.add_bus_effect(ECHO_BUS_INDEX, pitch_shift_effect, 1)

		var distortion_effect = AudioEffectDistortion.new()
		distortion_effect.set_parameter(AudioEffectDistortion.PARAM_MODE, AudioEffectDistortion.MODE_OVERDRIVE)
		distortion_effect.set_parameter(AudioEffectDistortion.PARAM_PREGAIN, 10.0)
		AudioServer.add_bus_effect(ECHO_BUS_INDEX, distortion_effect, 2)

func corrupt_memory_echo(memory_id: String, original_sound: AudioStream, location: Vector3, degradation_level: float = 0.5) -> void:
	if _active_echoes.has(memory_id):
		_active_echoes[memory_id].queue_free()

	var echo_player = AudioStreamPlayer3D.new()
	echo_player.name = "MemoryEcho_" + memory_id
	echo_player.stream = original_sound
	echo_player.bus = ECHO_BUS_NAME
	echo_player.unit_db = -5.0
	echo_player.max_distance = 50.0
	echo_player.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	echo_player.position = location
	add_child(echo_player)

	_update_echo_effects(degradation_level)

	echo_player.play()
	_active_echoes[memory_id] = echo_player
	print("Corrupted memory echo '%s' created at %s" % [memory_id, location])

func _update_echo_effects(degradation_level: float) -> void:
	var bus_idx = AudioServer.get_bus_index(ECHO_BUS_NAME)
	if bus_idx == -1:
		return

	var granular_effect = AudioServer.get_bus_effect(bus_idx, 0) as AudioEffectGranular
	if granular_effect:
		granular_effect.set_parameter(AudioEffectGranular.PARAM_RATE, lerp(0.5, 2.0, degradation_level))
		granular_effect.set_parameter(AudioEffectGranular.PARAM_JITTER, lerp(0.2, 0.8, degradation_level))

	var pitch_shift_effect = AudioServer.get_bus_effect(bus_idx, 1) as AudioEffectPitchShift
	if pitch_shift_effect:
		pitch_shift_effect.set_parameter(AudioEffectPitchShift.PARAM_PITCH_SCALE, lerp(0.7, 0.3, degradation_level))

	var distortion_effect = AudioServer.get_bus_effect(bus_idx, 2) as AudioEffectDistortion
	if distortion_effect:
		distortion_effect.set_parameter(AudioEffectDistortion.PARAM_PREGAIN, lerp(10.0, 30.0, degradation_level))

func remove_memory_echo(memory_id: String) -> void:
	if _active_echoes.has(memory_id):
		var echo_player = _active_echoes[memory_id]
		echo_player.stop()
		echo_player.queue_free()
		_active_echoes.erase(memory_id)
		print("Memory echo '%s' removed." % memory_id)

func cleanup_all_echoes() -> void:
	for memory_id in _active_echoes.keys():
		remove_memory_echo(memory_id)
