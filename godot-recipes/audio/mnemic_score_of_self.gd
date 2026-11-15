extends Node

signal memory_lost(memory_id: String)
signal memory_recovered(memory_id: String)

const FADE_SPEED := 2.0 # Amplitude change per second
const PITCH_SHIFT_SPEED := 50.0 # Frequency change per second

var _sample_rate: float
var _voices_data: Dictionary = {} # {memory_id: {generator, player, playback, freq, amp, phase, active, target_amp, target_freq, base_freq}}

func _ready() -> void:
	_sample_rate = AudioServer.get_mix_rate()
	
	var voice_configs: Dictionary = {
		"courage": {"base_freq": 220.0}, # Bass-like
		"empathy": {"base_freq": 440.0}, # Mid-range
		"resolve": {"base_freq": 660.0}, # Higher-range
		"joy": {"base_freq": 880.0} # Treble-like
	}
	
	for memory_id in voice_configs:
		var config = voice_configs[memory_id]
		var generator := AudioStreamGenerator.new()
		generator.mix_rate = _sample_rate
		generator.buffer_length = 0.05 # Small buffer for responsiveness
		
		var player := AudioStreamPlayer.new()
		player.stream = generator
		player.bus = "Master" # All voices initially on Master
		player.name = "VoicePlayer_" + memory_id
		add_child(player)
		player.play()
		
		_voices_data[memory_id] = {
			"generator": generator,
			"player": player,
			"playback": player.get_stream_playback(),
			"base_freq": config.base_freq,
			"freq": config.base_freq,
			"amp": 0.0, # Start silent, will fade in
			"phase": 0.0,
			"active": true, # All voices are initially active but silent
			"target_amp": 1.0, # Target full amplitude
			"target_freq": config.base_freq,
		}
	
	_setup_silence_bus()
	
	# Initial state: all memories present, so fade them in
	for memory_id in _voices_data:
		recover_memory(memory_id)

func _setup_silence_bus() -> void:
	var silence_bus_idx = AudioServer.get_bus_index("Silence")
	if silence_bus_idx == -1:
		silence_bus_idx = AudioServer.add_bus(AudioServer.get_bus_count())
		AudioServer.set_bus_name(silence_bus_idx, "Silence")
		AudioServer.set_bus_send(silence_bus_idx, "Master")
		var distortion_effect := AudioEffectDistortion.new()
		distortion_effect.mode = AudioEffectDistortion.MODE_CLIP
		distortion_effect.pre_gain = 10.0
		AudioServer.add_bus_effect(silence_bus_idx, distortion_effect, 0)
		AudioServer.set_bus_mute(silence_bus_idx, true) # Start muted

func _process(delta: float) -> void:
	for memory_id in _voices_data:
		var voice = _voices_data[memory_id]
		var playback: AudioStreamGeneratorPlayback = voice.playback
		
		# Smoothly transition amplitude and frequency
		voice.amp = lerp(voice.amp, voice.target_amp, FADE_SPEED * delta)
		voice.freq = lerp(voice.freq, voice.target_freq, PITCH_SHIFT_SPEED * delta)
		
		# Only push frames if active or fading out
		if voice.active or voice.amp > 0.01:
			var frames_to_push = playback.get_frames_available()
			for _i in range(frames_to_push):
				var sample_value = sin(voice.phase * TAU) * voice.amp
				playback.push_frame(Vector2(sample_value, sample_value)) # Stereo
				voice.phase += voice.freq / _sample_rate
				if voice.phase >= 1.0:
					voice.phase -= 1.0
		# Stop player if fully faded out and inactive
		elif voice.amp <= 0.01 and voice.player.playing:
			voice.player.stop()

func lose_memory(memory_id: String) -> void:
	if not _voices_data.has(memory_id): return
	
	var voice = _voices_data[memory_id]
	voice.target_amp = 0.0
	voice.target_freq = voice.base_freq * 0.5 # Distort pitch downwards
	voice.active = false
	
	# Unmute and make the 'Silence' bus audible when a memory is lost
	var silence_bus_idx = AudioServer.get_bus_index("Silence")
	if silence_bus_idx != -1:
		AudioServer.set_bus_mute(silence_bus_idx, false)
		AudioServer.set_bus_volume_db(silence_bus_idx, -5.0)
	
	emit_signal("memory_lost", memory_id)

func recover_memory(memory_id: String) -> void:
	if not _voices_data.has(memory_id): return
	
	var voice = _voices_data[memory_id]
	voice.target_amp = 1.0
	voice.target_freq = voice.base_freq
	voice.active = true
	if not voice.player.playing:
		voice.player.play()
	
	# Check if all memories are recovered, then mute Silence bus
	var all_recovered = true
	for id in _voices_data:
		if not _voices_data[id].active:
			all_recovered = false
			break
	
	if all_recovered:
		var silence_bus_idx = AudioServer.get_bus_index("Silence")
		if silence_bus_idx != -1:
			AudioServer.set_bus_mute(silence_bus_idx, true)
	
	emit_signal("memory_recovered", memory_id)

func update_silence_proximity(proximity_factor: float) -> void:
	# proximity_factor from 0.0 (far) to 1.0 (very close)
	var silence_bus_idx = AudioServer.get_bus_index("Silence")
	if silence_bus_idx != -1:
		# Increase distortion pre_gain as Silence gets closer
		var distortion_effect: AudioEffectDistortion = AudioServer.get_bus_effect(silence_bus_idx, 0)
		if distortion_effect:
			distortion_effect.pre_gain = lerp(1.0, 20.0, proximity_factor)
		
		# Also, make the main music slightly muffled or lower volume on Master bus
		var master_bus_idx = AudioServer.get_bus_index("Master")
		if master_bus_idx != -1:
			AudioServer.set_bus_volume_db(master_bus_idx, lerp(0.0, -10.0, proximity_factor))
