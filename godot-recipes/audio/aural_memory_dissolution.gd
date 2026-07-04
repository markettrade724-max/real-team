extends Node

signal memory_state_changed(new_state: float)

@export_range(0.0, 1.0, 0.01)
var memory_state: float = 1.0: # 1.0 is full memory, 0.0 is complete loss
	set(value):
		_set_memory_state(value)

@export
var bus_names_to_affect: Array[String] = ["Environment", "Hunters", "Dialogue"]

@export_range(0.0, 20.0, 0.1)
var max_volume_reduction_db: float = 15.0 # Max volume reduction for affected buses in dB

@export_range(200.0, 20000.0, 10.0)
var min_lowpass_cutoff_hz: float = 500.0 # Lowest cutoff frequency for low-pass filter

@export_range(0.0, 1.0, 0.01)
var max_distortion_drive: float = 0.8 # Highest drive for distortion effect

@export_range(0.0, 20.0, 0.1)
var max_distortion_pre_gain_db: float = 10.0 # Highest pre-gain for distortion effect

func _ready() -> void:
	_update_audio_effects()

func _set_memory_state(value: float) -> void:
	var clamped_value: float = clampf(value, 0.0, 1.0)
	if memory_state != clamped_value:
		memory_state = clamped_value
		_update_audio_effects()
		memory_state_changed.emit(memory_state)

func _update_audio_effects() -> void:
	var degradation_factor: float = 1.0 - memory_state
	
	for bus_name in bus_names_to_affect:
		var bus_idx: int = AudioServer.get_bus_index(bus_name)
		if bus_idx == -1:
			continue

		var current_volume_db: float = lerp(0.0, -max_volume_reduction_db, degradation_factor)
		AudioServer.set_bus_volume_db(bus_idx, current_volume_db)

		for i in range(AudioServer.get_bus_effect_count(bus_idx)):
			var effect: AudioEffect = AudioServer.get_bus_effect(bus_idx, i)

			if effect is AudioEffectLowPassFilter:
				var low_pass_effect: AudioEffectLowPassFilter = effect
				low_pass_effect.cutoff_hz = lerp(20000.0, min_lowpass_cutoff_hz, degradation_factor)

			elif effect is AudioEffectDistortion:
				var distortion_effect: AudioEffectDistortion = effect
				distortion_effect.drive = lerp(0.0, max_distortion_drive, degradation_factor)
				distortion_effect.pre_gain = lerp(0.0, max_distortion_pre_gain_db, degradation_factor)
