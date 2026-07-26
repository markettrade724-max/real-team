extends Node3D

class_name MnemonicErosionBlaster

# Predefined GLSL shader for the memory erosion effect on the consumed shard.
const MEMORY_EROSION_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float dissolve_progress : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D albedo_texture : hint_albedo;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform vec4 dissolve_color : source_color = vec4(1.0, 0.0, 0.0, 1.0); // Red glow

void fragment() {
	vec4 base_color = texture(albedo_texture, UV) * albedo_color;
	float alpha = base_color.a;

	// Simple dissolve based on Y-coordinate. A noise texture would be more organic.
	// The dissolve_progress uniform controls how much of the mesh has dissolved.
	
	if (dissolve_progress > 0.0 && dissolve_progress < 1.0) {
		if (UV.y < dissolve_progress) {
			alpha = 0.0; // Fully transparent below dissolve line
		} else if (UV.y < dissolve_progress + 0.05) { // Small glow band at the edge
			float edge_alpha = smoothstep(dissolve_progress, dissolve_progress + 0.05, UV.y);
			ALBEDO = mix(base_color.rgb, dissolve_color.rgb, edge_alpha);
			ALPHA = mix(base_color.a, dissolve_color.a, edge_alpha);
		}
	} else if (dissolve_progress >= 1.0) {
		alpha = 0.0; // Fully dissolved, completely transparent
	}

	ALBEDO = base_color.rgb;
	ALPHA = alpha;
}
"""

# --- Exports and Member Variables ---
@export var projectile_scene: PackedScene # Scene for the projectile to be instantiated.
@export var fire_point_path: NodePath # Path to a Node3D where projectiles are spawned.
@export var erosion_mesh_path: NodePath # Path to a MeshInstance3D for the memory erosion visual.
@export var erosion_particles_path: NodePath # Path to a GPUParticles3D for the erosion particle effect.
@export var base_damage: float = 10.0 # Base damage for projectiles before memory shard modifiers.
@export var lyra_node_path: NodePath # Path to Lyra's character node to apply debuffs.
@export var fire_cooldown: float = 0.5 # Time in seconds between shots.

var _memory_shards: Array[Dictionary] = [] # Stores available memory shards as dictionaries.
var _is_firing: bool = false # Flag to prevent rapid-fire.
var _erosion_shader_material: ShaderMaterial # Material instance for the erosion effect.
var _erosion_mesh_instance: MeshInstance3D # Cached reference to the erosion mesh.
var _erosion_particles: GPUParticles3D # Cached reference to the erosion particles.
var _fire_point: Node3D # Cached reference to the fire point.

# --- Godot Lifecycle Methods ---
func _ready() -> void:
	_fire_point = get_node_or_null(fire_point_path)
	_erosion_mesh_instance = get_node_or_null(erosion_mesh_path)
	_erosion_particles = get_node_or_null(erosion_particles_path)
	_setup_erosion_shader()

# --- Public API ---
func add_memory_shard(shard_data: Dictionary) -> void:
	# Adds a memory shard to the blaster's inventory.
	# shard_data example: { "type": "Emotional", "value": 0.5, "effect": "fire", "debuff": "blurred_vision" }
	_memory_shards.append(shard_data)
	print("Memory shard added: %s" % shard_data.get("type", "Unknown"))

func fire() -> void:
	# Initiates the firing sequence, consuming a memory shard.
	if _is_firing:
		return

	if _memory_shards.is_empty():
		print("No memory shards to fire!")
		return

	_is_firing = true
	var chosen_shard: Dictionary = _select_memory_shard()
	_consume_memory_shard(chosen_shard)
	_create_projectile(chosen_shard)
	_apply_debuff(chosen_shard)

	await get_tree().create_timer(fire_cooldown).timeout # Cooldown before next shot.
	_is_firing = false

# --- Private Helper Methods ---
func _setup_erosion_shader() -> void:
	# Initializes the ShaderMaterial for the erosion effect.
	if _erosion_mesh_instance:
		_erosion_shader_material = ShaderMaterial.new()
		_erosion_shader_material.shader = Shader.new()
		_erosion_shader_material.shader.code = MEMORY_EROSION_SHADER_CODE
		_erosion_mesh_instance.material_override = _erosion_shader_material
		_erosion_shader_material.set_shader_parameter("dissolve_progress", 0.0)
		_erosion_mesh_instance.visible = false # Start invisible.

func _select_memory_shard() -> Dictionary:
	# Selects a memory shard to be consumed. Currently, it's the last added shard.
	return _memory_shards.pop_back()

func _consume_memory_shard(shard: Dictionary) -> void:
	# Visually consumes the memory shard using a shader and particles.
	print("Consuming memory shard: %s" % shard.get("type", "Unknown"))
	if _erosion_mesh_instance and _erosion_shader_material:
		_erosion_mesh_instance.visible = true
		_erosion_shader_material.set_shader_parameter("albedo_color", _get_shard_color(shard.get("type", "")))
		_erosion_shader_material.set_shader_parameter("dissolve_progress", 0.0) # Reset for new dissolve.
		
		var tween = create_tween()
		tween.tween_property(_erosion_shader_material, "shader_parameter/dissolve_progress", 1.0, 0.8) \
			.set_ease(Tween.EASE_IN_OUT) \
			.set_trans(Tween.TRANS_QUAD)
		tween.tween_callback(func(): _erosion_mesh_instance.visible = false)
		
		if _erosion_particles:
			# Duplicate material to avoid modifying shared resource if it's not unique.
			_erosion_particles.process_material = _erosion_particles.process_material.duplicate() as ParticleProcessMaterial
			# Assumes the particle process material uses a shader with a 'color_ramp' uniform.
			_erosion_particles.process_material.set_shader_parameter("color_ramp", _get_shard_color_ramp(shard.get("type", "")))
			_erosion_particles.emitting = true
			_erosion_particles.one_shot = true
			_erosion_particles.amount = 50 # Adjust particle count as needed.
			_erosion_particles.restart()

func _create_projectile(shard: Dictionary) -> void:
	# Instantiates and customizes a projectile based on the consumed shard.
	if not projectile_scene or not _fire_point:
		return

	var projectile_instance = projectile_scene.instantiate()
	get_tree().root.add_child(projectile_instance)
	projectile_instance.global_transform = _fire_point.global_transform

	var projectile_damage = base_damage * shard.get("value", 1.0)
	var elemental_effect = shard.get("effect", "none")

	# Assumes the projectile scene has a script with a 'setup_projectile' method.
	if projectile_instance.has_method("setup_projectile"):
		projectile_instance.setup_projectile(projectile_damage, elemental_effect)
	
	# Example: Adjust projectile's GPUParticles3D if it has one.
	# This assumes the projectile scene has a GPUParticles3D child named "ProjectileParticles".
	if projectile_instance.has_node("ProjectileParticles") and projectile_instance.get_node("ProjectileParticles") is GPUParticles3D:
		var proj_particles: GPUParticles3D = projectile_instance.get_node("ProjectileParticles")
		# Duplicate material to avoid modifying shared resource.
		proj_particles.process_material = proj_particles.process_material.duplicate() as ParticleProcessMaterial
		# Assumes the particle process material uses a shader with a 'color_ramp' uniform.
		proj_particles.process_material.set_shader_parameter("color_ramp", _get_shard_color_ramp(shard.get("type", "")))
		proj_particles.emitting = true
		proj_particles.one_shot = true
		proj_particles.restart()

func _apply_debuff(shard: Dictionary) -> void:
	# Applies an identity debuff to Lyra based on the consumed memory shard.
	var lyra = get_node_or_null(lyra_node_path)
	if lyra and lyra.has_method("apply_identity_debuff"):
		var debuff_type = shard.get("debuff", "generic_loss")
		lyra.apply_identity_debuff(debuff_type)
		print("Applied debuff '%s' to Lyra." % debuff_type)

func _get_shard_color(shard_type: String) -> Color:
	# Returns a color based on the memory shard type for visual feedback.
	match shard_type:
		"Emotional": return Color.RED
		"Skill": return Color.BLUE
		"Sensory": return Color.GREEN
		_: return Color.WHITE

func _get_shard_color_ramp(shard_type: String) -> GradientTexture1D:
	# Creates a GradientTexture1D for particle color ramps based on shard type.
	var gradient = Gradient.new()
	match shard_type:
		"Emotional":
			gradient.set_point_color(0, Color.RED)
			gradient.set_point_color(1, Color.ORANGE)
		"Skill":
			gradient.set_point_color(0, Color.BLUE)
			gradient.set_point_color(1, Color.CYAN)
		"Sensory":
			gradient.set_point_color(0, Color.GREEN)
			gradient.set_point_color(1, Color.LIME_GREEN)
		_:
			gradient.set_point_color(0, Color.WHITE)
			gradient.set_point_color(1, Color.LIGHT_GRAY)
	var grad_tex = GradientTexture1D.new()
	grad_tex.gradient = gradient
	return grad_tex
