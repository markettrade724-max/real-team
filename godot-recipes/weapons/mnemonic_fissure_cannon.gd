class_name MnemonicFissureCannon extends Node3D

@export_category("Cannon Settings")
@export var fire_cost_per_shot: float = 0.05 # Percentage of shard integrity consumed per shot
@export var projectile_scene: PackedScene # Scene for the projectile fired by the cannon
@export var fire_rate_seconds: float = 0.5 # Time between shots
@export var muzzle_node: Node3D # Where projectiles spawn from

var _loaded_shard: MemoryShard = null
var _can_fire: bool = true

signal memory_lost(shard_id: String)
signal shard_degraded(shard_id: String, current_integrity: float, degradation_level: float)
signal fired_projectile(projectile_instance: Node3D)

func _ready() -> void:
	if not muzzle_node:
		printerr("MnemonicFissureCannon: 'muzzle_node' is not set. Projectiles will spawn at cannon origin.")

func load_shard(shard: MemoryShard) -> void:
	if _loaded_shard:
		_loaded_shard.depleted.disconnect(_on_loaded_shard_depleted)
	_loaded_shard = shard
	if _loaded_shard:
		_loaded_shard.depleted.connect(_on_loaded_shard_depleted)
		printt("MnemonicFissureCannon: Loaded shard", _loaded_shard.memory_name)
	else:
		printt("MnemonicFissureCannon: Unloaded shard.")

func fire() -> bool:
	if not _can_fire:
		return false
	if not _loaded_shard or _loaded_shard.is_depleted():
		printerr("MnemonicFissureCannon: No shard loaded or shard depleted.")
		return false

	_can_fire = false
	get_tree().create_timer(fire_rate_seconds).timeout.connect(func(): _can_fire = true)

	var fired_successfully: bool = _loaded_shard.degrade(fire_cost_per_shot)
	var current_degradation_level: float = _loaded_shard.get_degradation_level()

	emit_signal("shard_degraded", _loaded_shard.id, _loaded_shard.current_integrity, current_degradation_level)

	_spawn_projectile(current_degradation_level)

	if not fired_successfully:
		_unload_shard()
		return false

	return true

func _spawn_projectile(degradation_level: float) -> void:
	if not projectile_scene:
		printerr("MnemonicFissureCannon: 'projectile_scene' is not set. Cannot spawn projectile.")
		return

	var projectile_instance: Node3D = projectile_scene.instantiate()
	get_tree().root.add_child(projectile_instance)

	var spawn_transform: Transform3D = muzzle_node.global_transform if muzzle_node else global_transform
	projectile_instance.global_transform = spawn_transform

	_apply_degradation_to_projectile(projectile_instance, degradation_level)

	emit_signal("fired_projectile", projectile_instance)

func _apply_degradation_to_projectile(projectile_instance: Node3D, degradation_level: float) -> void:
	if projectile_instance.has_method("set_degradation_level"):
		projectile_instance.set_degradation_level(degradation_level)
	else:
		var mesh_instance: MeshInstance3D = projectile_instance.find_child("MeshInstance3D") as MeshInstance3D
		if mesh_instance and mesh_instance.get_surface_override_material_count() > 0:
			var material: ShaderMaterial = mesh_instance.get_surface_override_material(0) as ShaderMaterial
			if material and material.shader and _loaded_shard and material.has_shader_parameter(_loaded_shard.degradation_shader_param):
				material.set_shader_parameter(_loaded_shard.degradation_shader_param, degradation_level)
			else:
				printerr("MnemonicFissureCannon: Projectile material or shader uniform not found for degradation.")
		else:
			printerr("MnemonicFissureCannon: Projectile does not have a MeshInstance3D or a material to set degradation.")

func _on_loaded_shard_depleted(shard_id: String) -> void:
	emit_signal("memory_lost", shard_id)
	_unload_shard()

func _unload_shard() -> void:
	if _loaded_shard:
		_loaded_shard.depleted.disconnect(_on_loaded_shard_depleted)
		_loaded_shard = null
		printt("MnemonicFissureCannon: Shard fully depleted and unloaded.")

func get_current_shard_integrity() -> float:
	return _loaded_shard.current_integrity if _loaded_shard else 0.0

func get_degradation_level() -> float:
	return _loaded_shard.get_degradation_level() if _loaded_shard else 0.0

func has_loaded_shard() -> bool:
	return _loaded_shard != null