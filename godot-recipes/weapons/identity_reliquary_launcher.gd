class_name MemoryFragment extends Resource

@export var id: String = ""
@export var display_name: String = "Untitled Memory"
@export var description: String = "A forgotten echo."
@export var mesh_seed: int = 0 # Used for procedural mesh generation
@export var base_color: Color = Color.WHITE
@export var texture_path: String = "" # Path to a texture for the memory fragment


# --- Embedded Shader Code ---
const EROSION_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float erosion_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D erosion_noise_texture : hint_default_white;
uniform vec4 albedo : source_color;
uniform sampler2D texture_albedo : source_color;

void vertex() {
	// Simple vertex displacement for initial visual "instability"
	// Not the primary erosion, but can add to the effect
	VERTEX.y += sin(TIME * 5.0 + VERTEX.x * 10.0) * 0.005 * erosion_amount;
}

void fragment() {
	vec2 base_uv = UV;
	vec4 albedo_tex = texture(texture_albedo, base_uv);
	ALBEDO = albedo.rgb * albedo_tex.rgb;

	// Sample noise texture for erosion pattern
	float noise_value = texture(erosion_noise_texture, base_uv * 2.0 + TIME * 0.1).r;

	// Discard fragments based on erosion_amount and noise
	if (noise_value < erosion_amount) {
		discard;
	}

	METALLIC = 0.0;
	ROUGHNESS = 0.8;
	SPECULAR = 0.5;
}
"""


# --- Main Reliquary Launcher Script ---

@tool
class ReliquaryLauncher extends Node3D:
	signal memory_lost(fragment_id: String)
	
	@export var projectile_scene: PackedScene # Scene for the memory projectile (RigidBody3D with MeshInstance3D)
	@export var impact_particles_scene: PackedScene # Scene for GPUParticles3D impact effect
	@export var launch_speed: float = 20.0
	@export var available_memories: Array[MemoryFragment] # List of memories Lyra currently holds
	@export var erosion_rate_per_second: float = 0.5 # How fast the memory erodes (0.0 to 1.0 per second)

	var _current_erosion_shader_material: ShaderMaterial # Base material for duplication

	func _ready() -> void:
		if Engine.is_editor_hint():
			return

		_current_erosion_shader_material = ShaderMaterial.new()
		var shader = Shader.new()
		shader.code = EROSION_SHADER_CODE
		_current_erosion_shader_material.shader = shader
		# Optional: Load a specific noise texture here if desired, otherwise hint_default_white is used.
		# var noise_tex = preload("res://path/to/your/noise_texture.png")
		# _current_erosion_shader_material.set_shader_parameter("erosion_noise_texture", noise_tex)

	func launch_memory_fragment(fragment: MemoryFragment, launch_origin: Node3D) -> void:
		if not projectile_scene:
			push_error("ReliquaryLauncher: Projectile scene not set!")
			return
		if not fragment:
			push_error("ReliquaryLauncher: No memory fragment provided for launch!")
			return

		# Remove fragment from available memories
		var fragment_index = available_memories.find(fragment)
		if fragment_index != -1:
			available_memories.remove_at(fragment_index)
		else:
			push_warning("ReliquaryLauncher: Attempted to launch a memory not in available_memories.")
			return # Don't launch if not available

		var projectile_instance: RigidBody3D = projectile_scene.instantiate()
		add_child(projectile_instance)

		projectile_instance.global_transform = launch_origin.global_transform
		projectile_instance.linear_velocity = launch_origin.global_transform.basis.z * -launch_speed # Assuming -Z is forward

		# Find the MeshInstance3D child and apply the generated mesh and material
		var mesh_instance: MeshInstance3D = projectile_instance.find_child("MeshInstance3D")
		if mesh_instance:
			mesh_instance.mesh = _generate_projectile_mesh(fragment)
			var projectile_material = _current_erosion_shader_material.duplicate() # Duplicate to have unique erosion state
			projectile_material.set_shader_parameter("albedo", fragment.base_color)
			if not fragment.texture_path.is_empty() and ResourceLoader.exists(fragment.texture_path):
				projectile_material.set_shader_parameter("texture_albedo", ResourceLoader.load(fragment.texture_path))
			mesh_instance.material_override = projectile_material
			
			# Store fragment ID and material on the projectile for impact and erosion handling
			projectile_instance.set_meta("memory_fragment_id", fragment.id)
			projectile_instance.set_meta("memory_fragment_material", projectile_material)
			projectile_instance.set_meta("current_erosion_amount", 0.0) # Initialize erosion amount

			# Connect to body_entered for impact detection
			projectile_instance.body_entered.connect(_on_projectile_body_entered.bind(projectile_instance))
		else:
			push_error("ReliquaryLauncher: Projectile scene must contain a MeshInstance3D named 'MeshInstance3D'.")
			projectile_instance.queue_free()
			return

	func _generate_projectile_mesh(fragment: MemoryFragment) -> ArrayMesh:
		var st = SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)

		# Use fragment.mesh_seed for variation (e.g., different random sizes/shapes)
		var rng = RandomNumberGenerator.new()
		rng.seed = fragment.mesh_seed
		var size = rng.randf_range(0.3, 0.7) # Vary size based on seed

		# Simple cube mesh for demonstration. Can be expanded for more complex shapes.
		var vertices = [
			Vector3(-size, -size, size), Vector3(size, -size, size), Vector3(size, size, size), Vector3(-size, size, size), # Front
			Vector3(-size, -size, -size), Vector3(-size, size, -size), Vector3(size, size, -size), Vector3(size, -size, -size), # Back
			Vector3(-size, size, -size), Vector3(-size, size, size), Vector3(size, size, size), Vector3(size, size, -size), # Top
			Vector3(-size, -size, -size), Vector3(size, -size, -size), Vector3(size, -size, size), Vector3(-size, -size, size), # Bottom
			Vector3(size, -size, -size), Vector3(size, size, -size), Vector3(size, size, size), Vector3(size, -size, size), # Right
			Vector3(-size, -size, -size), Vector3(-size, -size, size), Vector3(-size, size, size), Vector3(-size, size, -size)  # Left
		]
		var uvs = [
			Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0), # Front
			Vector2(1, 1), Vector2(1, 0), Vector2(0, 0), Vector2(0, 1), # Back
			Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), # Top
			Vector2(1, 1), Vector2(0, 1), Vector2(0, 0), Vector2(1, 0), # Bottom
			Vector2(1, 1), Vector2(1, 0), Vector2(0, 0), Vector2(0, 1), # Right
			Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)  # Left
		]
		var indices = [
			0, 1, 2, 2, 3, 0, # Front
			4, 5, 6, 6, 7, 4, # Back
			8, 9, 10, 10, 11, 8, # Top
			12, 13, 14, 14, 15, 12, # Bottom
			16, 17, 18, 18, 19, 16, # Right
			20, 21, 22, 22, 23, 20  # Left
		]

		for i in range(vertices.size()):
			st.add_uv(uvs[i])
			st.add_vertex(vertices[i])

		for i in range(indices.size()):
			st.add_index(indices[i])

		st.generate_normals()
		st.generate_tangents() # Required for spatial shaders

		return st.commit()

	func _on_projectile_body_entered(body: Node3D, projectile_node: RigidBody3D) -> void:
		var fragment_id = projectile_node.get_meta("memory_fragment_id", "")

		if not fragment_id.is_empty():
			emit_signal("memory_lost", fragment_id)

		# Instantiate and play impact particles
		if impact_particles_scene:
			var particles_instance: GPUParticles3D = impact_particles_scene.instantiate()
			get_tree().root.add_child(particles_instance) # Add to root to ensure it plays independently
			particles_instance.global_transform.origin = projectile_node.global_transform.origin
			particles_instance.emitting = true
			particles_instance.finished.connect(particles_instance.queue_free) # Clean up particles after they finish

		projectile_node.queue_free() # Remove the projectile

	func _process(delta: float) -> void:
		# Iterate through children to find active projectiles and update their erosion
		for child in get_children():
			if child is RigidBody3D and child.has_meta("memory_fragment_material"):
				var projectile_material: ShaderMaterial = child.get_meta("memory_fragment_material")
				var current_erosion: float = child.get_meta("current_erosion_amount")

				current_erosion = min(current_erosion + erosion_rate_per_second * delta, 1.0)
				projectile_material.set_shader_parameter("erosion_amount", current_erosion)
				child.set_meta("current_erosion_amount", current_erosion)

				# Optional: If fully eroded before impact, queue free. 
				# This might cause issues if it's about to hit something, so often impact handles destruction.
				# if current_erosion >= 1.0:
				# 	child.queue_free()
