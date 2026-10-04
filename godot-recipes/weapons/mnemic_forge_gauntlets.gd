extends Node3D

# --- Signals ---
signal memory_purged(memory_id: String)
signal effect_created(effect_node: Node3D)

# --- Enums ---
enum MemoryType {
	EMOTION_FURY,
	EMOTION_GRIEF,
	LOCATION_HOME,
	LOCATION_BATTLEFIELD,
	PERSON_LOVED_ONE,
	PERSON_RIVAL
}

# --- Exported Properties ---
@export var projectile_scene: PackedScene # Base scene for projectiles (MeshInstance3D, CollisionShape3D)
@export var shield_scene: PackedScene     # Base scene for shields (MeshInstance3D, CollisionShape3D)
@export var forging_animation_player_path: NodePath # Path to AnimationPlayer node for forging visual
@export var memory_effect_shader: Shader  # The shader resource for memory effects

# --- Private Variables ---
var _animation_player: AnimationPlayer

# --- Godot Lifecycle ---
func _ready():
	_animation_player = get_node_or_null(forging_animation_player_path)
	if not _animation_player:
		push_warning("AnimationPlayer not found at path: %s" % forging_animation_player_path)
	if not memory_effect_shader:
		push_error("Memory effect shader not assigned. Please assign a Shader resource.")

# --- Public API ---
# Forges a temporary weapon or shield from a memory fragment.
# memory_fragment: Dictionary with keys "id" (String), "type" (MemoryType),
#                  "essence" (Color), "power" (float 0.0-100.0).
func forge_memory_effect(memory_fragment: Dictionary):
	if not memory_fragment.has_all(["id", "type", "essence", "power"]):
		push_error("Invalid memory fragment structure. Required keys: id, type, essence, power.")
		return

	_play_forging_animation()

	var effect_node: Node3D
	match memory_fragment.type:
		MemoryType.EMOTION_FURY, MemoryType.PERSON_RIVAL, MemoryType.LOCATION_BATTLEFIELD:
			effect_node = _create_projectile(memory_fragment)
		MemoryType.EMOTION_GRIEF, MemoryType.PERSON_LOVED_ONE, MemoryType.LOCATION_HOME:
			effect_node = _create_shield(memory_fragment)
		_:
			push_warning("Unhandled memory type: %s. No effect forged." % memory_fragment.type)
			return

	if effect_node:
		add_child(effect_node)
		effect_created.emit(effect_node)
		_purge_memory(memory_fragment.id)

# --- Private Helper Functions ---
# Creates and configures a projectile node.
func _create_projectile(memory_fragment: Dictionary) -> Node3D:
	if not projectile_scene:
		push_error("Projectile scene not set in Mnemic Forging Gauntlets.")
		return null
	var projectile = projectile_scene.instantiate() as Node3D
	_configure_effect_node(projectile, memory_fragment, true)
	return projectile

# Creates and configures a shield node.
func _create_shield(memory_fragment: Dictionary) -> Node3D:
	if not shield_scene:
		push_error("Shield scene not set in Mnemic Forging Gauntlets.")
		return null
	var shield = shield_scene.instantiate() as Node3D
	_configure_effect_node(shield, memory_fragment, false)
	return shield

# Configures the visual and physical properties of the forged effect.
func _configure_effect_node(effect_node: Node3D, memory_fragment: Dictionary, is_projectile: bool):
	var mesh_instance = effect_node.find_child("MeshInstance3D") as MeshInstance3D
	var collision_shape = effect_node.find_child("CollisionShape3D") as CollisionShape3D

	if not mesh_instance or not collision_shape:
		push_error("Effect node '%s' missing 'MeshInstance3D' or 'CollisionShape3D' child." % effect_node.name)
		effect_node.queue_free()
		return

	# Set collision shape and mesh based on effect type
	if is_projectile:
		collision_shape.shape = SphereShape3D.new()
		(collision_shape.shape as SphereShape3D).radius = 0.2 + (memory_fragment.power / 100.0) * 0.3 # 0.2 to 0.5
		mesh_instance.mesh = SphereMesh.new()
	else: # Shield
		collision_shape.shape = BoxShape3D.new()
		(collision_shape.shape as BoxShape3D).size = Vector3(0.8, 0.8, 0.1) * (0.5 + memory_fragment.power / 100.0 * 0.5) # Scale
		mesh_instance.mesh = PlaneMesh.new()

	# Apply dynamic shader material
	var material = ShaderMaterial.new()
	material.shader = memory_effect_shader
	_apply_shader_parameters(material, memory_fragment)
	mesh_instance.material_override = material

	# Set a timer for effect dissipation
	var lifetime = 1.5 + (memory_fragment.power / 100.0) * 2.5 # 1.5 to 4 seconds
	var timer = Timer.new()
	timer.wait_time = lifetime
	timer.one_shot = true
	timer.timeout.connect(effect_node.queue_free)
	effect_node.add_child(timer)
	timer.start()

# Sets shader uniform parameters based on memory fragment properties.
func _apply_shader_parameters(material: ShaderMaterial, memory_fragment: Dictionary):
	if not material.shader: return
	material.set_shader_parameter("albedo_color", memory_fragment.essence)
	material.set_shader_parameter("emission_strength", memory_fragment.power / 100.0 * 5.0)
	material.set_shader_parameter("distortion_intensity", memory_fragment.power / 100.0 * 0.5)
	material.set_shader_parameter("time_factor", 0.0) # For animation within shader

# Triggers the gauntlet's forging animation.
func _play_forging_animation():
	if _animation_player and _animation_player.has_animation("forge"):
		_animation_player.play("forge")
	elif _animation_player:
		push_warning("Forging animation 'forge' not found in AnimationPlayer.")
	else:
		push_warning("AnimationPlayer not set for Mnemic Forging Gauntlets.")

# Emits a signal to indicate a memory fragment has been consumed.
func _purge_memory(memory_id: String):
	memory_purged.emit(memory_id)
