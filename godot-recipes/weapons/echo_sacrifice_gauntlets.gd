extends Node3D

class_name EchoSacrificeGauntlets

signal memory_consumed(memory_id: String, trait: String)
signal identity_trait_lost(trait: String, is_core: bool)

@export var base_melee_damage: float = 10.0
@export var boost_duration: float = 3.0
@export var sacrifice_sound: AudioStream
@export var lyra_arm_material: Material # Material to apply shader effect to

var _current_grafted_memory: Dictionary = {} # {id: "", trait: "", power_level: 1.0, is_core_memory: false}
var _damage_boost_active: bool = false
var _current_damage_multiplier: float = 1.0
var _boost_timer: Timer

func _ready() -> void:
	_boost_timer = Timer.new()
	add_child(_boost_timer)
	_boost_timer.one_shot = true
	_boost_timer.timeout.connect(_on_boost_timer_timeout)

func graft_memory(memory_data: Dictionary) -> bool:
	"""
	Grafts a memory fragment into the gauntlets.
	Returns true if successful, false if gauntlets are already loaded.
	"""
	if not _current_grafted_memory.is_empty():
		return false # Gauntlets already have a grafted memory

	_current_grafted_memory = memory_data
	return true

func activate_sacrifice_attack() -> void:
	"""
	Triggers a powerful attack by consuming the grafted memory.
	Applies temporary damage boost and removes identity trait.
	"""
	if _current_grafted_memory.is_empty():
		return

	var memory_id: String = _current_grafted_memory.get("id", "unknown")
	var trait_to_lose: String = _current_grafted_memory.get("trait", "unknown_trait")
	var power_level: float = _current_grafted_memory.get("power_level", 1.0)
	var is_core: bool = _current_grafted_memory.get("is_core_memory", false)

	# Apply temporary damage boost
	_current_damage_multiplier = power_level
	_damage_boost_active = true
	_boost_timer.start(boost_duration)

	# Trigger visual and auditory cues
	_play_sacrifice_effects()

	# Remove identity trait from Lyra
	emit_identity_trait_lost(trait_to_lose, is_core)
	emit_memory_consumed(memory_id, trait_to_lose)

	# Clear the grafted memory
	_current_grafted_memory = {}

func get_current_melee_damage() -> float:
	"""
	Returns the current melee damage, accounting for active boosts.
	"""
	return base_melee_damage * _current_damage_multiplier

func _play_sacrifice_effects() -> void:
	"""
	Plays visual and auditory cues for memory sacrifice.
	"""
	if sacrifice_sound:
		var audio_player = AudioStreamPlayer.new()
		audio_player.stream = sacrifice_sound
		add_child(audio_player)
		audio_player.play()
		audio_player.finished.connect(audio_player.queue_free)

	# Trigger shader effect on Lyra's arm material
	if lyra_arm_material and lyra_arm_material is ShaderMaterial:
		# Assuming the shader has a 'sacrifice_effect_active' uniform
		lyra_arm_material.set_shader_parameter("sacrifice_effect_active", true)
		# Reset the shader parameter after a short duration
		get_tree().create_timer(1.0).timeout.connect(func():
			if lyra_arm_material and lyra_arm_material is ShaderMaterial:
				lyra_arm_material.set_shader_parameter("sacrifice_effect_active", false)
		)
	# A GPUParticles3D node could also be spawned here for additional visual flair

func _on_boost_timer_timeout() -> void:
	"""
	Resets damage multiplier when boost duration ends.
	"""
	_damage_boost_active = false
	_current_damage_multiplier = 1.0

func emit_identity_trait_lost(trait: String, is_core: bool) -> void:
	"""
	Emits the signal for identity trait loss.
	This would typically be connected to Lyra's identity manager.
	"""
	emit_signal("identity_trait_lost", trait, is_core)
