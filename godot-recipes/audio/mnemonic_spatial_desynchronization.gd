extends Node

@export_range(0.0, 1.0, 0.01) var memory_integrity: float = 1.0:
	set(value):
		memory_integrity = clampf(value, 0.0, 1.0)
		_update_global_audio_effects()

@export var drift_intensity_multiplier: float = 5.0
@export var drift_frequency: float = 0.75
@export var reverb_bus_name: String = "Master"
@export var reverb_effect_index: int = 0

var _affected_players: Array[AudioStreamPlayer3D] = []
var _time_elapsed: float = 0.0

func _ready() -> void:
	_update_global_audio_effects()

func _process(delta: float) -> void:
	_time_elapsed += delta
	_update_player_drifts()

func register_affected_player(player: AudioStreamPlayer3D) -> void:
	if not _affected_players.has(player):
		_affected_players.append(player)

func unregister_affected_player(player: AudioStreamPlayer3D) -> void:
	if _affected_players.has(player):
		_affected_players.erase(player)

func _update_global_audio_effects() -> void:
	var bus_idx: int = AudioServer.get_bus_index(reverb_bus_name)
	if bus_idx == -1:
		push_warning("Audio bus '%s' not found." % reverb_bus_name)
		return

	if reverb_effect_index >= AudioServer.get_bus_effect_count(bus_idx):
		push_warning("Reverb effect index %d out of bounds for bus '%s'." % [reverb_effect_index, reverb_bus_name])
		return

	var effect: AudioEffect = AudioServer.get_bus_effect(bus_idx, reverb_effect_index)
	var disorientation_factor: float = 1.0 - memory_integrity

	if effect is AudioEffectReverb:
		var reverb_effect: AudioEffectReverb = effect
		reverb_effect.wet_mix = lerp(0.1, 0.8, disorientation_factor)
		reverb_effect.room_size = lerp(0.5, 1.0, disorientation_factor)
		reverb_effect.damping = lerp(0.5, 0.2, disorientation_factor)
		reverb_effect.feedback_decay = lerp(0.7, 1.5, disorientation_factor)
	elif effect is AudioEffectDelay:
		var delay_effect: AudioEffectDelay = effect
		delay_effect.dry = lerp(1.0, 0.5, disorientation_factor)
		delay_effect.tap1_active = disorientation_factor > 0.1
		delay_effect.tap1_delay_ms = lerp(100.0, 500.0, disorientation_factor)
		delay_effect.tap1_volume_db = lerp(-24.0, -6.0, disorientation_factor)
		delay_effect.tap2_active = disorientation_factor > 0.3
		delay_effect.tap2_delay_ms = lerp(200.0, 1000.0, disorientation_factor)
		delay_effect.tap2_volume_db = lerp(-30.0, -12.0, disorientation_factor)
	else:
		push_warning("Effect at index %d on bus '%s' is not a Reverb or Delay effect. Cannot apply drift." % [reverb_effect_index, reverb_bus_name])

func _update_player_drifts() -> void:
	var disorientation_factor: float = 1.0 - memory_integrity
	var current_drift_magnitude: float = drift_intensity_multiplier * disorientation_factor

	for player in _affected_players:
		if not is_instance_valid(player):
			continue

		var unique_offset_seed: float = float(player.get_instance_id()) * 0.1
		var x_offset: float = sin((_time_elapsed + unique_offset_seed) * drift_frequency) * current_drift_magnitude
		var y_offset: float = cos((_time_elapsed + unique_offset_seed * 1.5) * drift_frequency * 0.8) * current_drift_magnitude * 0.5
		var z_offset: float = sin((_time_elapsed + unique_offset_seed * 2.0) * drift_frequency * 1.2) * current_drift_magnitude

		player.position_offset = Vector3(x_offset, y_offset, z_offset)
