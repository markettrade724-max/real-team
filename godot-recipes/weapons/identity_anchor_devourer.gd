extends Node3D

class_name MemoryFragment extends Resource
	@export var memory_name: String = "Unknown Memory"
	@export var visual_mesh_path: String = "" # Path to a .tscn or .obj/.glb for the fragment's visual
	@export var memory_type: String = "Generic" # e.g., "Courage", "Love", "Regret"
	@export var effect_payload: Dictionary = {"damage": 10, "stun_duration": 0.0}
	@export var identity_cost_description: String = "A piece of yourself is lost."

# --- Shader Code for Memory Dissolution ---
const DISSOLUTION_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform float dissolution_progress : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D texture_albedo : hint_albedo;
uniform vec4 albedo : source_color;
uniform sampler2D noise_texture : hint_normal; // For a more organic dissolve

void vertex() {
	float displacement_strength = sin(dissolution_progress * PI) * 0.1;
	VERTEX.xyz += NORMAL * displacement_strength * (1.0 - dissolution_progress);
}

void fragment() {
	vec4 base_color = texture(texture_albedo, UV) * albedo;
	float dissolve_threshold = dissolution_progress;

	float noise_val = texture(noise_texture, UV * 5.0).r;
	float final_alpha = base_color.a;

	if (noise_val < dissolve_threshold) {
		final_alpha = 0.0;
	} else {
		float edge_fade = smoothstep(dissolve_threshold - 0.1, dissolve_threshold, noise_val);
		final_alpha *= edge_fade;
	}

	ALPHA = final_alpha;
	ALBEDO = base_color.rgb;
}
"""
# --- End Shader Code ---

@export var ingestion_port_path: NodePath
@export var projectile_particles_scene: PackedScene # A pre-configured GPUParticles3D scene
@export var noise_texture_path: String = "res://default_noise.png" # Path to a noise texture for the shader

var _ingestion_port: Node3D
var _current_fragment_mesh: MeshInstance3D
var _dissolution_shader_material: ShaderMaterial
var _noise_texture: Texture2D

func _ready() -> void:
	_ingestion_port = get_node_or_null(ingestion_port_path)
	if not _ingestion_port:
		push_error("Ingestion port not found at path: ", ingestion_port_path)
		set_process(false)
		return

	_noise_texture = load(noise_texture_path)
	if not _noise_texture:
		push_warning("Noise texture not found at path: ", noise_texture_path, ". Using empty texture.")
		_noise_texture = ImageTexture.new() # Fallback to prevent crash

func consume_memory(memory_fragment: MemoryFragment) -> void:
	if not is_instance_valid(_ingestion_port):
		push_error("Ingestion port is invalid.")
		return
	if _current_fragment_mesh:
		_current_fragment_mesh.queue_free() # Clear previous fragment if any

	# 1. Instantiate and place memory fragment mesh
	var fragment_scene = load(memory_fragment.visual_mesh_path)
	if not fragment_scene is PackedScene:
		push_error("Invalid visual_mesh_path for memory fragment: ", memory_fragment.visual_mesh_path)
		return
	_current_fragment_mesh = fragment_scene.instantiate() as MeshInstance3D
	if not _current_fragment_mesh:
		push_error("Failed to instantiate fragment mesh.")
		return

	_ingestion_port.add_child(_current_fragment_mesh)
	_current_fragment_mesh.transform = Transform3D.IDENTITY # Position at local origin of port

	# 2. Apply dissolution shader
	_dissolution_shader_material = ShaderMaterial.new()
	_dissolution_shader_material.shader = Shader.new()
	_dissolution_shader_material.shader.code = DISSOLUTION_SHADER_CODE
	_dissolution_shader_material.set_shader_parameter("noise_texture", _noise_texture)

	# Assuming the fragment mesh has a single surface material
	if _current_fragment_mesh.mesh and _current_fragment_mesh.mesh.get_surface_count() > 0:
		var original_material = _current_fragment_mesh.get_active_material(0) as StandardMaterial3D
		if original_material:
			_dissolution_shader_material.set_shader_parameter("texture_albedo", original_material.albedo_texture)
			_dissolution_shader_material.set_shader_parameter("albedo", original_material.albedo_color)
		_current_fragment_mesh.set_surface_override_material(0, _dissolution_shader_material)
	else:
		push_warning("Fragment mesh has no surfaces or material to override.")

	# 3. Animate dissolution
	var tween = create_tween()
	tween.tween_property(_dissolution_shader_material, "shader_parameter/dissolution_progress", 1.0, 1.5)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(Callable(self, "_on_dissolution_finished").bind(_current_fragment_mesh, memory_fragment))

	# 4. Emit projectile particles
	emit_projectile(memory_fragment)

	# 5. Apply identity cost and combat effects (simulated)
	_apply_identity_cost(memory_fragment)
	_apply_combat_effects(memory_fragment)

func _on_dissolution_finished(fragment_mesh: MeshInstance3D, memory_fragment: MemoryFragment) -> void:
	if is_instance_valid(fragment_mesh):
		fragment_mesh.queue_free()
	print("Memory fragment '", memory_fragment.memory_name, "' fully dissolved.")

func emit_projectile(memory_fragment: MemoryFragment) -> void:
	if not projectile_particles_scene:
		push_warning("Projectile particles scene not set.")
		return

	var particles: GPUParticles3D = projectile_particles_scene.instantiate()
	_ingestion_port.add_child(particles)
	particles.transform = Transform3D.IDENTITY # Start at local origin of port

	# Configure particles based on memory_type
	_configure_particles_by_memory_type(particles, memory_fragment.memory_type)

	particles.emitting = true

func _configure_particles_by_memory_type(particles: GPUParticles3D, memory_type: String) -> void:
	var process_material = particles.process_material as ParticleProcessMaterial
	if not process_material:
		push_warning("GPUParticles3D does not have a ParticleProcessMaterial.")
		return

	match memory_type:
		"Courage":
			process_material.color = Color("ffcc00") # Gold
			process_material.initial_velocity_min = 10.0
			process_material.initial_velocity_max = 15.0
			process_material.lifetime = 1.5
		"Love":
			process_material.color = Color("ff6699") # Pink
			process_material.initial_velocity_min = 8.0
			process_material.initial_velocity_max = 12.0
			process_material.lifetime = 2.0
		"Regret":
			process_material.color = Color("6699ff") # Blue
			process_material.initial_velocity_min = 12.0
			process_material.initial_velocity_max = 18.0
			process_material.lifetime = 1.0
		_: # Generic
			process_material.color = Color("cccccc") # Grey
			process_material.initial_velocity_min = 7.0
			process_material.initial_velocity_max = 10.0
			process_material.lifetime = 1.8

func _apply_identity_cost(memory_fragment: MemoryFragment) -> void:
	print("Identity Cost: ", memory_fragment.identity_cost_description)
	# Implement actual game logic for identity loss here:
	# - Reduce a 'sanity' or 'identity' stat.
	# - Apply a temporary or permanent debuff to Lyra.
	# - Remove the memory from Lyra's actual inventory/memory list.

func _apply_combat_effects(memory_fragment: MemoryFragment) -> void:
	print("Combat Effects: ", memory_fragment.effect_payload)
	# Implement actual game logic for combat effects here:
	# - Deal damage to an enemy.
	# - Apply status effects (stun, slow, burn) to enemies.
	# - This would likely involve instantiating a projectile scene that carries the payload.