extends Node

@export var debt_time_scale_factor: float = 0.3 # How much to slow down enemies/environment
@export var debt_duration: float = 3.0 # Max active time before forced deactivation
@export var memory_drain_rate: float = 10.0 # Memory cohesion drained per second
@export var max_memory_cohesion: float = 100.0 # Total memory cohesion available

@export var post_process_layer: CanvasLayer # Assign in editor
@export var distortion_rect: TextureRect # Assign in editor, child of post_process_layer
@export var audio_player: AudioStreamPlayer # Assign in editor

var _is_debt_active: bool = false
var _current_debt_time: float = 0.0
var _current_memory_cohesion: float = max_memory_cohesion
var _time_elapsed: float = 0.0

func _ready() -> void:
	if distortion_rect and distortion_rect.material is ShaderMaterial:
		distortion_rect.material.set_shader_parameter("distortion_intensity", 0.0)
	Engine.time_scale = 1.0

func _process(delta: float) -> void:
	_time_elapsed += delta
	if distortion_rect and distortion_rect.material is ShaderMaterial:
		distortion_rect.material.set_shader_parameter("time_elapsed", _time_elapsed)

	if _is_debt_active:
		_current_debt_time += delta
		# Drain memory cohesion, scaled by how much time is slowed (to make it feel consistent)
		_current_memory_cohesion -= memory_drain_rate * delta * (1.0 / Engine.time_scale)
		
		var debt_progress = min(_current_debt_time / debt_duration, 1.0)
		var memory_loss_factor = 1.0 - (_current_memory_cohesion / max_memory_cohesion)
		var distortion_strength = debt_progress * 0.7 + memory_loss_factor * 0.3 # Mix based on time and memory loss
		
		_apply_visual_audio_effects(distortion_strength)

		if _current_debt_time >= debt_duration or _current_memory_cohesion <= 0.0:
			deactivate_mnemonic_debt()
	else:
		_fade_out_effects(delta)

func activate_mnemonic_debt() -> void:
	if not _is_debt_active and _current_memory_cohesion > 0.0:
		_is_debt_active = true
		_current_debt_time = 0.0
		Engine.time_scale = debt_time_scale_factor
		if audio_player and not audio_player.playing:
			audio_player.play()

func deactivate_mnemonic_debt() -> void:
	if _is_debt_active:
		_is_debt_active = false
		Engine.time_scale = 1.0

func _apply_visual_audio_effects(strength: float) -> void:
	if distortion_rect and distortion_rect.material is ShaderMaterial:
		distortion_rect.material.set_shader_parameter("distortion_intensity", strength)
	if audio_player:
		audio_player.pitch_scale = lerp(1.0, 0.7, strength)
		audio_player.playback_speed = lerp(1.0, 0.7, strength)

func _fade_out_effects(delta: float) -> void:
	if distortion_rect and distortion_rect.material is ShaderMaterial:
		var current_intensity = distortion_rect.material.get_shader_parameter("distortion_intensity")
		if current_intensity > 0.0:
			current_intensity = max(0.0, current_intensity - delta * 0.8) # Faster fade out
			_apply_visual_audio_effects(current_intensity)
		else:
			if audio_player and audio_player.playing:
				audio_player.stop()

func get_memory_cohesion() -> float:
	return _current_memory_cohesion

func add_memory_cohesion(amount: float) -> void:
	_current_memory_cohesion = min(max_memory_cohesion, _current_memory_cohesion + amount)
