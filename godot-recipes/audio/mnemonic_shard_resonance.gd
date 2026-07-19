@tool
extends Node3D

class_name MnemonicShardResonance

@export_range(100.0, 1000.0, 1.0) var base_frequency: float = 440.0:
	set(value):
		base_frequency = value
		if _generator:
			_generator.base_frequency = base_frequency
@export_range(0.0, 1.0, 0.01) var base_amplitude: float = 0.5:
	set(value):
		base_amplitude = value
		if _generator:
			_generator.base_amplitude = base_amplitude
@export_range(10.0, 100.0, 1.0) var max_corruption_distance: float = 50.0
@export_range(1.0, 10.0, 1.0) var min_corruption_distance: float = 5.0
@export var silence_hunter_path: NodePath # Path to the Silence Hunter (e.g., /root/Game/SilenceHunter)

var _audio_player: AudioStreamPlayer3D
var _generator: MnemonicShardGenerator
var _time_elapsed: float = 0.0
var _corruption_level: float = 0.0
var _is_lost: bool = false
var _sample_rate: int = AudioServer.get_mix_rate()

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_audio_player = AudioStreamPlayer3D.new()
	add_child(_audio_player)

	_generator = MnemonicShardGenerator.new()
	_generator.mix_rate = _sample_rate
	_generator.base_frequency = base_frequency
	_generator.base_amplitude = base_amplitude
	_audio_player.stream = _generator
	_audio_player.unit_db = -10.0 # Slightly lower volume by default
	_audio_player.autoplay = true
	_audio_player.play()

	# Ensure the playback object is retrieved, though _fill_buffer is on the resource
	var _generator_stream_playback: AudioStreamGeneratorPlayback = _audio_player.get_stream_playback() as AudioStreamGeneratorPlayback
	if not _generator_stream_playback:
		push_error("Failed to get AudioStreamGeneratorPlayback.")
		return

func _process(delta: float) -> void:
	if Engine.is_editor_hint() or _is_lost:
		return

	_time_elapsed += delta
	_generator.time_elapsed = _time_elapsed

	var hunter_node: Node3D = get_node_or_null(silence_hunter_path)
	if hunter_node:
		var distance: float = global_position.distance_to(hunter_node.global_position)
		_corruption_level = calculate_corruption_level(distance)
	else:
		_corruption_level = 0.0 # No hunter, no corruption

	_generator.corruption_level = _corruption_level

func calculate_corruption_level(distance: float) -> float:
	if distance > max_corruption_distance:
		return 0.0
	if distance < min_corruption_distance:
		return 1.0
	# Linear interpolation for corruption
	var normalized_distance: float = (distance - min_corruption_distance) / (max_corruption_distance - min_corruption_distance)
	return 1.0 - normalized_distance # Closer = higher corruption

func lose_memory() -> void:
	_is_lost = true
	if _audio_player and _audio_player.is_playing():
		_generator.is_lost = true
		_generator.corruption_level = 1.0 # Ensure full corruption/static
		# No need to stop and replay, the generator's _fill_buffer will adapt

# Custom AudioStreamGenerator resource to handle buffer filling and corruption
class MnemonicShardGenerator extends AudioStreamGenerator:
	@export var base_frequency: float = 440.0
	@export var base_amplitude: float = 0.5
	@export var corruption_level: float = 0.0 # 0.0 (clean) to 1.0 (fully corrupted)
	@export var time_elapsed: float = 0.0
	@export var is_lost: bool = false

	var _phase: float = 0.0
	var _rng: RandomNumberGenerator = RandomNumberGenerator.new()

	func _init() -> void:
		_rng.randomize()

	func _fill_buffer(frames: PackedVector2Array) -> int:
		if is_lost:
			# Generate 'dead static' when memory is lost
			for i in range(frames.size()):
				var static_val: float = _rng.randf_range(-0.1, 0.1)
				frames[i] = Vector2(static_val, static_val)
			return OK

		var sample_rate: int = mix_rate
		var phase_increment: float = (2.0 * PI * base_frequency) / sample_rate

		for i in range(frames.size()):
			var sample: float = sin(_phase) * base_amplitude

			# Apply corruption based on corruption_level
			if corruption_level > 0.0:
				# 1. Add noise, scaled by corruption_level
				var noise_amount: float = _rng.randf_range(-0.2, 0.2) * corruption_level
				sample += noise_amount

				# 2. Amplitude modulation (flickering/glitching), scaled by corruption_level
				var amp_mod_factor: float = 1.0 - (sin(time_elapsed * 10.0 + _rng.randf_range(0.0, PI)) * 0.5 + 0.5) * corruption_level * 0.5
				sample *= amp_mod_factor

				# 3. Pitch shift / frequency wobble, scaled by corruption_level
				var freq_wobble_factor: float = sin(time_elapsed * 5.0 + _rng.randf_range(0.0, PI)) * 0.1 * corruption_level
				var current_phase_increment: float = (2.0 * PI * (base_frequency + base_frequency * freq_wobble_factor)) / sample_rate
				_phase += current_phase_increment
			else:
				_phase += phase_increment

			# Clamp sample to prevent clipping
			sample = clamp(sample, -1.0, 1.0)
			frames[i] = Vector2(sample, sample)

		return OK
