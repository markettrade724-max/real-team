extends Node3D

# --- Exported Parameters ---
@export var hum_bus_name: String = "HumBus"
@export var flare_bus_name: String = "FlareBus"
@export var max_hum_distance: float = 20.0
@export var min_hum_cutoff: float = 200.0
@export var max_hum_cutoff: float = 8000.0
@export var flare_duration: float = 0.5
@export var flare_volume_boost: float = 10.0
@export var hunter_alert_radius: float = 50.0
@export var interaction_distance: float = 2.5
@export var interaction_action: String = "interact" # Input action to activate memory

# --- Internal Variables ---
var _player: Node3D # Assumed to be the parent of this node
var _hum_bus_idx: int
var _flare_bus_idx: int
var _flare_player: AudioStreamPlayer3D
var _current_closest_fragment: Node3D = null
var _flare_active: bool = false
var _original_flare_bus_volume: float
var _original_flare_bus_filter_cutoff: float = 0.0
var _original_flare_bus_filter_resonance: float = 0.0

# --- Signals ---
signal hunter_alert(alert_position: Vector3, alert_radius: float)
signal memory_activated(fragment_position: Vector3)

# --- Godot Lifecycle Methods ---
func _ready() -> void:
	_player = get_parent() # Assuming this script is a child of Lyra

	_hum_bus_idx = AudioServer.get_bus_index(hum_bus_name)
	if _hum_bus_idx == -1:
		push_error("HumBus '%s' not found! Please create it in Project Settings -> Audio -> Buses." % hum_bus_name)
		set_process(false)
		return

	_flare_bus_idx = AudioServer.get_bus_index(flare_bus_name)
	if _flare_bus_idx == -1:
		push_error("FlareBus '%s' not found! Please create it in Project Settings -> Audio -> Buses." % flare_bus_name)
		set_process(false)
		return

	_flare_player = AudioStreamPlayer3D.new()
	add_child(_flare_player)
	_flare_player.bus = flare_bus_name
	_flare_player.unit_db = 0.0 # Bus volume will manage overall loudness

	# Store original FlareBus parameters to restore after flare
	_original_flare_bus_volume = AudioServer.get_bus_volume_db(_flare_bus_idx)
	for i in range(AudioServer.get_bus_effect_count(_flare_bus_idx)):
		var effect = AudioServer.get_bus_effect(_flare_bus_idx, i)
		if effect is AudioEffectFilter:
			_original_flare_bus_filter_cutoff = effect.cutoff_hz
			_original_flare_bus_filter_resonance = effect.resonance
			break # Assuming one filter effect per bus

	# Initialize HumBus to a low state
	_set_hum_bus_parameters(0.0)

func _physics_process(delta: float) -> void:
	_update_hum_and_fragment_detection()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed(interaction_action) and not _flare_active:
		_try_activate_memory()

# --- Core Logic Methods ---
func _update_hum_and_fragment_detection() -> void:
	var closest_dist_sq: float = INF
	var new_closest_fragment: Node3D = null

	# Find all potential memory fragments (nodes in "memory_fragments" group with 'memory_audio_stream' metadata)
	for node in get_tree().get_nodes_in_group("memory_fragments"):
		if not node is Node3D:
			continue
		if not node.has_meta("memory_audio_stream"):
			continue

		var dist_sq = _player.global_position.distance_squared_to(node.global_position)
		if dist_sq < closest_dist_sq:
			closest_dist_sq = dist_sq
			new_closest_fragment = node

	_current_closest_fragment = new_closest_fragment

	var hum_intensity: float = 0.0
	if _current_closest_fragment:
		var distance = sqrt(closest_dist_sq)
		if distance < max_hum_distance:
			hum_intensity = 1.0 - (distance / max_hum_distance)
			hum_intensity = clampf(hum_intensity, 0.0, 1.0) # Ensure 0-1 range

	_set_hum_bus_parameters(hum_intensity)

func _set_hum_bus_parameters(intensity: float) -> void:
	# Modulate filter cutoff and resonance based on intensity
	var current_cutoff = lerpf(min_hum_cutoff, max_hum_cutoff, intensity)
	var current_resonance = lerpf(0.5, 5.0, intensity) # Example resonance range

	for i in range(AudioServer.get_bus_effect_count(_hum_bus_idx)):
		var effect = AudioServer.get_bus_effect(_hum_bus_idx, i)
		if effect is AudioEffectFilter:
			effect.cutoff_hz = current_cutoff
			effect.resonance = current_resonance
			break # Assuming one filter effect per bus

	# Optionally, modulate bus volume
	AudioServer.set_bus_volume_db(_hum_bus_idx, lerpf(-60.0, -10.0, intensity)) # Example volume range

func _try_activate_memory() -> void:
	if _current_closest_fragment and _current_closest_fragment.has_meta("memory_audio_stream"):
		var distance = _player.global_position.distance_to(_current_closest_fragment.global_position)
		if distance <= interaction_distance:
			_activate_memory_fragment(_current_closest_fragment)

func _activate_memory_fragment(fragment: Node3D) -> void:
	var audio_stream: AudioStream = fragment.get_meta("memory_audio_stream")
	if not audio_stream:
		push_error("Memory fragment at %s has no 'memory_audio_stream' meta data!" % fragment.name)
		return

	_flare_player.stream = audio_stream
	_flare_player.global_position = fragment.global_position # Spatialized flare
	_flare_player.play()

	# Apply temporary extreme effects to FlareBus
	AudioServer.set_bus_volume_db(_flare_bus_idx, _original_flare_bus_volume + flare_volume_boost)
	for i in range(AudioServer.get_bus_effect_count(_flare_bus_idx)):
		var effect = AudioServer.get_bus_effect(_flare_bus_idx, i)
		if effect is AudioEffectDistortion:
			effect.set_param(AudioEffectDistortion.PARAM_DRIVE, 0.8) # Example distortion
		elif effect is AudioEffectReverb:
			effect.set_param(AudioEffectReverb.PARAM_WET, 0.7) # Example reverb
		elif effect is AudioEffectFilter:
			effect.cutoff_hz = 20000.0 # Open filter for raw sound
			effect.resonance = 0.1 # Low resonance

	_flare_active = true
	_flare_player.finished.connect(_on_flare_finished, CONNECT_ONE_SHOT) # Connect to reset after stream finishes
	get_tree().create_timer(flare_duration).timeout.connect(_on_flare_duration_ended, CONNECT_ONE_SHOT) # Ensure effects reset after duration

	emit_signal("hunter_alert", fragment.global_position, hunter_alert_radius)
	emit_signal("memory_activated", fragment.global_position)

	# Optionally remove or disable the fragment after activation
	fragment.queue_free() # Example: fragment is consumed upon activation

func _on_flare_finished() -> void:
	# This ensures the flare effects are reset even if the stream is shorter than flare_duration
	if _flare_active:
		_reset_flare_bus_parameters()

func _on_flare_duration_ended() -> void:
	# This ensures the flare effects are reset even if the stream is longer than flare_duration
	if _flare_active:
		_reset_flare_bus_parameters()

func _reset_flare_bus_parameters() -> void:
	AudioServer.set_bus_volume_db(_flare_bus_idx, _original_flare_bus_volume)
	for i in range(AudioServer.get_bus_effect_count(_flare_bus_idx)):
		var effect = AudioServer.get_bus_effect(_flare_bus_idx, i)
		if effect is AudioEffectDistortion:
			effect.set_param(AudioEffectDistortion.PARAM_DRIVE, 0.0) # Reset distortion
		elif effect is AudioEffectReverb:
			effect.set_param(AudioEffectReverb.PARAM_WET, 0.0) # Reset reverb
		elif effect is AudioEffectFilter:
			effect.cutoff_hz = _original_flare_bus_filter_cutoff
			effect.resonance = _original_flare_bus_filter_resonance

	_flare_active = false
