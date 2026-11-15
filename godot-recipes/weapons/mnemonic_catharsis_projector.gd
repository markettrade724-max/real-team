# memory_fragment.gd
class_name MemoryFragment extends Resource

@export var fragment_name: String = "Untitled Memory"
@export_multiline var description: String = "A forgotten piece of self."
@export_range(0.0, 1.0, 0.01) var emotional_charge: float = 0.5 # Affects damage, AoE
@export var chronological_significance: int = 1 # Affects projectile speed, duration
@export_range(0.0, 1.0, 0.01) var semantic_density: float = 0.5 # Affects special effects, debuffs
@export var dissolution_effect_scene: PackedScene # Scene with MeshInstance/Sprite3D + ShaderMaterial + ParticleSystem

func get_projectile_properties() -> Dictionary:
	var base_damage = 10.0
	var base_speed = 50.0
	var base_aoe_radius = 0.0
	var base_debuff_strength = 0.0

	var damage = base_damage + (emotional_charge * 20.0)
	var speed = base_speed + (float(chronological_significance) * 5.0)
	var aoe_radius = base_aoe_radius + (semantic_density * 3.0)
	var debuff_strength = base_debuff_strength + (semantic_density * 0.5)

	return {
		"damage": damage,
		"speed": speed,
		"aoe_radius": aoe_radius,
		"debuff_strength": debuff_strength,
		"projectile_type": "kinetic" if emotional_charge > 0.7 else "energy"
	}

# mnemonic_catharsis_projector.gd
extends Node3D

class_name MnemonicCatharsisProjector

signal memory_consumed(fragment_name: String)

@export var projectile_scene: PackedScene # Scene for the actual projectile (e.g., Projectile.tscn)
@export var fire_point: Node3D # Node3D representing the muzzle of the weapon
@export var dissolution_effect_parent: Node3D # Node3D to parent the dissolution effect (e.g., player or weapon node)

func _ready() -> void:
	if not projectile_scene:
		push_warning("Projectile scene not set for MnemonicCatharsisProjector.")
	if not fire_point:
		push_warning("Fire point not set for MnemonicCatharsisProjector.")
	if not dissolution_effect_parent:
		push_warning("Dissolution effect parent not set for MnemonicCatharsisProjector.")

func fire(memory_fragment: MemoryFragment) -> void:
	if not is_instance_valid(memory_fragment):
		push_error("Attempted to fire with an invalid memory fragment.")
		return

	if not projectile_scene or not fire_point:
		push_error("MnemonicCatharsisProjector not fully configured to fire.")
		return

	_spawn_projectile(memory_fragment)
	_trigger_dissolution_effect(memory_fragment)
	memory_consumed.emit(memory_fragment.fragment_name)

func _spawn_projectile(memory_fragment: MemoryFragment) -> void:
	var projectile_properties = memory_fragment.get_projectile_properties()
	var projectile_instance = projectile_scene.instantiate() as Node3D
	if not is_instance_valid(projectile_instance):
		push_error("Failed to instantiate projectile scene.")
		return

	if projectile_instance.has_method("set_properties"):
		projectile_instance.set_properties(projectile_properties)
	else:
		push_warning("Projectile scene does not have 'set_properties' method.")

	fire_point.add_child(projectile_instance)
	projectile_instance.global_transform = fire_point.global_transform
	
	var direction = -fire_point.global_transform.basis.z # Assuming weapon points along -Z
	if projectile_instance is RigidBody3D:
		projectile_instance.apply_central_impulse(direction * projectile_properties.speed)
	elif projectile_instance.has_method("launch"):
		projectile_instance.launch(direction, projectile_properties.speed)

func _trigger_dissolution_effect(memory_fragment: MemoryFragment) -> void:
	if not is_instance_valid(memory_fragment.dissolution_effect_scene):
		push_warning("Memory fragment has no dissolution effect scene set.")
		return

	var effect_instance = memory_fragment.dissolution_effect_scene.instantiate() as Node3D
	if not is_instance_valid(effect_instance):
		push_error("Failed to instantiate dissolution effect scene.")
		return

	if dissolution_effect_parent:
		dissolution_effect_parent.add_child(effect_instance)
		effect_instance.global_transform = global_transform # Position at weapon or player
		if effect_instance.has_method("play_effect"):
			effect_instance.play_effect()
		elif effect_instance is GPUParticles3D:
			effect_instance.restart()
			effect_instance.emitting = true
	else:
		push_warning("Dissolution effect parent not set, effect not spawned.")