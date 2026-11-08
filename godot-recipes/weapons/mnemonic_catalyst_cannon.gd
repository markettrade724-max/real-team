extends Node3D

class_name MnemonicCatalystCannon

signal memory_consumed(shard_id: String)
signal identity_lost(shard_id: String)

@export var weapon_mesh: MeshInstance3D
@export var particle_system: GPUParticles3D
@export var animation_player: AnimationPlayer
@export var base_shader_material: ShaderMaterial # Assign a ShaderMaterial using mnemonic_catalyst_cannon.gdshader

var current_memory_shards: Array[MemoryShard] = []
var _active_shader_instance: ShaderMaterial

func _ready() -> void:
	_initialize_shader()

func _initialize_shader() -> void:
	if weapon_mesh and base_shader_material:
		_active_shader_instance = base_shader_material.duplicate() as ShaderMaterial
		weapon_mesh.set_surface_override_material(0, _active_shader_instance)
	else:
		push_error("MnemonicCatalystCannon: Weapon mesh or base shader material not assigned.")

func add_memory_shard(shard: MemoryShard) -> void:
	if shard:
		current_memory_shards.append(shard)
		print("MnemonicCatalystCannon: Memory shard '%s' added." % shard.memory_name)

func fire_weapon(shard_index: int) -> bool:
	if shard_index < 0 or shard_index >= current_memory_shards.size():
		push_error("MnemonicCatalystCannon: Invalid memory shard index.")
		return false

	var consumed_shard: MemoryShard = current_memory_shards[shard_index]
	current_memory_shards.remove_at(shard_index)

	_apply_shard_effect(consumed_shard)
	_update_weapon_visuals(consumed_shard)
	_dissipate_shard_particles(consumed_shard)
	_trigger_identity_loss(consumed_shard)

	animation_player.play("fire_animation")
	print("MnemonicCatalystCannon: Weapon fired, memory '%s' consumed." % consumed_shard.memory_name)
	memory_consumed.emit(consumed_shard.id)
	return true

func _apply_shard_effect(shard: MemoryShard) -> void:
	# This function would interact with other game systems (e.g., player combat, temporary buffs).
	print("MnemonicCatalystCannon: Applying effect from '%s' with strength: %f" % [shard.memory_name, shard.effect_strength])

func _update_weapon_visuals(shard: MemoryShard) -> void:
	if _active_shader_instance:
		_active_shader_instance.set_shader_parameter("albedo_color", shard.visual_color)
		_active_shader_instance.set_shader_parameter("glow_intensity", shard.effect_strength * 2.0)

func _dissipate_shard_particles(shard: MemoryShard) -> void:
	if particle_system and particle_system.process_material is ShaderMaterial:
		var particle_shader_material: ShaderMaterial = particle_system.process_material as ShaderMaterial
		particle_shader_material.set_shader_parameter("color_tint", shard.visual_color)
		if shard.particle_texture:
			particle_shader_material.set_shader_parameter("texture_albedo", shard.particle_texture)
		particle_system.amount = 50
		particle_system.lifetime = 1.0
		particle_system.restart()
		particle_system.emitting = true
	elif particle_system and particle_system.process_material is ParticleProcessMaterial:
		var particle_process_material: ParticleProcessMaterial = particle_system.process_material as ParticleProcessMaterial
		particle_process_material.color = shard.visual_color
		if shard.particle_texture:
			particle_process_material.texture = shard.particle_texture
		particle_system.amount = 50
		particle_system.lifetime = 1.0
		particle_system.restart()
		particle_system.emitting = true
	else:
		push_warning("MnemonicCatalystCannon: Particle system or its process material not configured for shard dissipation.")

func _trigger_identity_loss(shard: MemoryShard) -> void:
	identity_lost.emit(shard.id)
	print("MnemonicCatalystCannon: Identity fragment '%s' lost permanently." % shard.memory_name)
