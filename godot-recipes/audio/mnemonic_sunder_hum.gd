@tool
class_name MnemonicSunderHum extends AudioStreamPlayer3D

signal hum_intensity_changed(intensity: float)

@export_range(0.0, 1.0, 0.01) var memory_decay_progress: float = 0.0:
	set(value):
		memory_decay_progress = clampf(value, 0.0, 1.0)
		_update_sunder_hum()

@export var base_hum_stream: AudioStream: # Assign a looping AudioStream (e.g., AudioStreamWAV, AudioStreamOGGVorbis)
	set(value):
		base_hum_stream = value
		stream = base_hum_stream

@export var max_hum_volume_db: float = 0.0
@export var min_hum_volume_db: float = -24.0

var _sunder_hum_intensity: float = 0.0 # 0.0 (no hum) to 1.0 (full hum)
var _bus_name: String # Unique bus name for this instance

var _distortion_effect: AudioEffectDistortion
var _pitch_shift_effect: AudioEffectPitchShift

func _init() -> void:
	# Generate a unique bus name for this instance to ensure isolated audio processing
	_bus_name = "MemoryHumBus_" + str(hash(self))

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	if base_hum_stream:
		stream = base_hum_stream
		play()
	else:
		push_warning("MnemonicSunderHum: base_hum_stream not set. Hum will not play.")

	_setup_audio_bus_and_effects()
	_update_sunder_hum()

func _exit_tree() -> void:
	if Engine.is_editor_hint():
		return
	# Clean up the dynamically created bus when the node leaves the scene tree
	var bus_idx = AudioServer.get_bus_index(_bus_name)
	if bus_idx != -1:
		AudioServer.remove_bus(bus_idx)

func _setup_audio_bus_and_effects() -> void:
	# Create a new bus for this specific hum instance if it doesn't exist
	var bus_idx = AudioServer.get_bus_index(_bus_name)
	if bus_idx == -1:
		AudioServer.add_bus(AudioServer.get_bus_count()) # Add at the end of the bus list
		AudioServer.set_bus_name(AudioServer.get_bus_count() - 1, _bus_name)
		bus_idx = AudioServer.get_bus_count() - 1
		AudioServer.set_bus_send(bus_idx, "Master") # Route this bus to the Master bus

	# Assign this AudioStreamPlayer3D to the newly created bus
	bus = _bus_name

	# Add effects to this specific bus for dynamic manipulation
	_distortion_effect = AudioEffectDistortion.new()
	AudioServer.add_bus_effect(bus_idx, _distortion_effect)

	_pitch_shift_effect = AudioEffectPitchShift.new()
	AudioServer.add_bus_effect(bus_idx, _pitch_shift_effect)

func _update_sunder_hum() -> void:
	# Calculate hum intensity directly from decay progress
	_sunder_hum_intensity = memory_decay_progress

	# Update base volume of the AudioStreamPlayer3D
	volume_db = lerpf(min_hum_volume_db, max_hum_volume_db, _sunder_hum_intensity)

	# Dynamically adjust audio effect parameters based on hum intensity
	if _distortion_effect:
		_distortion_effect.drive = lerpf(1.0, 10.0, _sunder_hum_intensity) # Increase distortion with decay
		_distortion_effect.pre_gain = lerpf(0.0, 6.0, _sunder_hum_intensity)
		_distortion_effect.post_gain = lerpf(0.0, -6.0, _sunder_hum_intensity) # Compensate for gain increase
		_distortion_effect.mode = AudioEffectDistortion.MODE_OVERDRIVE

	if _pitch_shift_effect:
		_pitch_shift_effect.pitch_scale = lerpf(1.0, 0.7, _sunder_hum_intensity) # Lower pitch with decay
		_pitch_shift_effect.oversampling = AudioEffectPitchShift.OVERSAMPLING_2X

	emit_signal("hum_intensity_changed", _sunder_hum_intensity)

func get_sunder_hum_intensity() -> float:
	return _sunder_hum_intensity

func muffle_hum(duration: float = 1.0, target_decay_increase: float = 0.1) -> void:
	# Temporarily reduce the hum's volume, but incur a cost in memory decay
	var original_decay = memory_decay_progress
	var original_volume = volume_db

	var tween = create_tween()
	tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "volume_db", min_hum_volume_db - 12.0, duration * 0.5)
	tween.tween_callback(func():
		memory_decay_progress = clampf(original_decay + target_decay_increase, 0.0, 1.0)
	)
	tween.tween_property(self, "volume_db", original_volume, duration * 0.5)

func bloom_hum(duration: float = 1.0, target_decay_increase: float = 0.05) -> void:
	# Temporarily increase the hum's volume and intensity, potentially as a sonic decoy
	# Incurs a smaller cost in memory decay compared to muffling
	var original_decay = memory_decay_progress
	var original_volume = volume_db

	var tween = create_tween()
	tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "volume_db", max_hum_volume_db + 6.0, duration * 0.5)
	tween.tween_callback(func():
		memory_decay_progress = clampf(original_decay + target_decay_increase, 0.0, 1.0)
	)
	tween.tween_property(self, "volume_db", original_volume, duration * 0.5)
