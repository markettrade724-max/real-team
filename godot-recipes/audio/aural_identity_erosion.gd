extends Node

# --- Parameters ---
@export_range(0.0, 1.0, 0.01) var identity_cohesion: float = 1.0:
	set(value):
		identity_cohesion = clampf(value, 0.0, 1.0)
		_update_audio_effects()
@export var audio_bus_name: String = "IdentityBus"
@export var reverb_max_mix: float = 0.8 # Max reverb mix when cohesion is 0
@export var reverb_max_room_size: float = 1.0 # Max room size when cohesion is 0
@export var distortion_max_drive: float = 0.8 # Max distortion drive when cohesion is 0
@export var distortion_max_pre_gain: float = 6.0 # Max pre-gain for distortion when cohesion is 0
@export var pitch_shift_max_amount: float = 0.2 # Max pitch shift amount (e.g., 0.2 means 20% shift down) when cohesion is 0

# --- Internal State ---
var _bus_idx: int = -1
var _reverb_effect: AudioEffectReverb = null
var _distortion_effect: AudioEffectDistortion = null
var _pitch_shift_effect: AudioEffectPitchShift = null

func _ready() -> void:
	_bus_idx = AudioServer.get_bus_index(audio_bus_name)
	if _bus_idx == -1:
		push_error("Audio bus '%s' not found. Please create it in Project Settings -> Audio Bus Layout." % audio_bus_name)
		set_process(false)
		return

	_get_or_create_effects()
	_update_audio_effects()

func _get_or_create_effects() -> void:
	# Attempt to find existing effects, otherwise create them and add to the bus
	for i in range(AudioServer.get_bus_effect_count(_bus_idx)):
		var effect = AudioServer.get_bus_effect(_bus_idx, i)
		if effect is AudioEffectReverb:
			_reverb_effect = effect
		elif effect is AudioEffectDistortion:
			_distortion_effect = effect
		elif effect is AudioEffectPitchShift:
			_pitch_shift_effect = effect

	if not _reverb_effect:
		_reverb_effect = AudioEffectReverb.new()
		AudioServer.add_bus_effect(_bus_idx, _reverb_effect, -1)
	if not _distortion_effect:
		_distortion_effect = AudioEffectDistortion.new()
		AudioServer.add_bus_effect(_bus_idx, _distortion_effect, -1)
	if not _pitch_shift_effect:
		_pitch_shift_effect = AudioEffectPitchShift.new()
		AudioServer.add_bus_effect(_bus_idx, _pitch_shift_effect, -1)

func _update_audio_effects() -> void:
	# Invert cohesion for effect intensity: 0 cohesion = max effect, 1 cohesion = min effect
	var effect_intensity: float = 1.0 - identity_cohesion

	if _reverb_effect:
		# Reverb mix and room size increase as cohesion decreases
		_reverb_effect.set_param(AudioEffectReverb.PARAM_MIX, lerpf(0.0, reverb_max_mix, effect_intensity))
		_reverb_effect.set_param(AudioEffectReverb.PARAM_ROOM_SIZE, lerpf(0.5, reverb_max_room_size, effect_intensity))

	if _distortion_effect:
		# Distortion drive and pre-gain increase as cohesion decreases
		_distortion_effect.set_param(AudioEffectDistortion.PARAM_DRIVE, lerpf(0.0, distortion_max_drive, effect_intensity))
		_distortion_effect.set_param(AudioEffectDistortion.PARAM_PRE_GAIN, lerpf(0.0, distortion_max_pre_gain, effect_intensity))

	if _pitch_shift_effect:
		# Pitch shift amount increases (becomes more noticeable) as cohesion decreases
		# Shifts towards a slightly lower pitch when cohesion is low.
		_pitch_shift_effect.set_param(AudioEffectPitchShift.PARAM_PITCH_SHIFT, lerpf(1.0, 1.0 - pitch_shift_max_amount, effect_intensity))

func set_identity_cohesion(value: float) -> void:
	# Public method to update identity cohesion. The setter calls _update_audio_effects().
	identity_cohesion = value

func recover_memory(cohesion_increase: float = 0.1) -> void:
	# Increases identity cohesion, making sounds clearer
	set_identity_cohesion(identity_cohesion + cohesion_increase)

func lose_memory(cohesion_decrease: float = 0.15) -> void:
	# Decreases identity cohesion, making sounds more distorted
	set_identity_cohesion(identity_cohesion - cohesion_decrease)

func apply_proximity_distortion(proximity_factor: float) -> void:
	# Example of how proximity could influence cohesion.
	# proximity_factor: 0.0 (far) to 1.0 (close).
	# This function should be called externally, e.g., by an Area3D.
	# It temporarily reduces cohesion based on proximity, making effects more intense.
	var temp_cohesion_reduction = proximity_factor * 0.3 # Max 30% reduction
	set_identity_cohesion(identity_cohesion - temp_cohesion_reduction)
