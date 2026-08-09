extends Node3D

class_name MnemonicRecoilMortar

# Shader code for the memory shard degradation effect
const SHARD_DEGRADE_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D albedo_texture : source_color;
uniform float degradation_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec4 degradation_color : source_color = vec4(0.8, 0.2, 0.1, 1.0);
uniform float degradation_noise_scale = 10.0;
uniform float degradation_edge_sharpness = 5.0;

void fragment() {
	vec4 albedo_tex = texture(albedo_texture, UV);
	ALBEDO = albedo_tex.rgb;

	// Simple noise-based degradation
	vec2 noise_uv = UV * degradation_noise_scale;
	float noise = texture(TEXTURE_PIXEL_SIZE, noise_uv).r; // Using a simple texture for noise

	// Create a mask for degradation
	float degradation_mask = smoothstep(0.5 - degradation_amount * 0.5, 0.5 + degradation_amount * 0.5, noise);
	degradation_mask = pow(degradation_mask, degradation_edge_sharpness);

	// Blend between original albedo and degradation color
	ALBEDO = mix(ALBEDO, degradation_color.rgb, degradation_mask);
	ALPHA = mix(albedo_tex.a, degradation_color.a, degradation_mask); // Blend alpha too
}
"""

@export var muzzle_node: Node3D
@export var fire_force: float = 100.0
@export var degradation_cost_per_shot: float = 0.25
@export var shard_degradation_color: Color = Color(0.8, 0.2, 0.1, 1.0)
@export var shard_degradation_noise_scale: float = 10.0
@export var shard_degradation_edge_sharpness: float = 5.0

var _loaded_shard_node: RigidBody3D = null
var _loaded_memory_resource: Resource = null # Will be cast to MemoryShardResource

signal shard_fired(memory_resource_id: String)
signal no_shard_loaded()

func _ready():
	if not muzzle_node:
		push_error("Muzzle Node is not assigned for MnemonicRecoilMortar.")

func load_shard(shard_scene: PackedScene, memory_resource: Resource):
	if _loaded_shard_node:
		_loaded_shard_node.queue_free() # Free previous shard if any
	
	if not shard_scene or not memory_resource:
		push_error("Invalid shard scene or memory resource provided.")
		return

	var new_shard = shard_scene.instantiate() as RigidBody3D
	if not new_shard:
		push_error("Failed to instantiate shard scene as RigidBody3D.")
		return

	_loaded_shard_node = new_shard
	_loaded_memory_resource = memory_resource

	# Parent the shard to the muzzle and reset its transform
	muzzle_node.add_child(_loaded_shard_node)
	_loaded_shard_node.global_transform = muzzle_node.global_transform
	_loaded_shard_node.set_collision_layer_value(1, false) # Disable collision while loaded
	_loaded_shard_node.set_collision_mask_value(1, false)
	_loaded_shard_node.set_physics_process_mode(RigidBody3D.PHYSICS_PROCESS_MODE_DISABLED)

	_setup_shard_material(_loaded_shard_node)

func fire_shard():
	if not _loaded_shard_node or not _loaded_memory_resource:
		emit_signal("no_shard_loaded")
		return

	# Unparent and enable physics
	_loaded_shard_node.get_parent().remove_child(_loaded_shard_node)
	get_tree().get_root().add_child(_loaded_shard_node) # Add to root to keep it in scene
	_loaded_shard_node.set_collision_layer_value(1, true) # Re-enable collision
	_loaded_shard_node.set_collision_mask_value(1, true)
	_loaded_shard_node.set_physics_process_mode(RigidBody3D.PHYSICS_PROCESS_MODE_INHERIT)

	# Apply force
	var direction = -muzzle_node.global_transform.basis.z
	_loaded_shard_node.apply_central_impulse(direction * fire_force)

	# Apply visual degradation and update memory resource
	_apply_degradation_effect(_loaded_shard_node, degradation_cost_per_shot)
	
	# Assuming MemoryShardResource has a degrade method
	if _loaded_memory_resource is MemoryShardResource:
		(_loaded_memory_resource as MemoryShardResource).degrade(degradation_cost_per_shot)
		emit_signal("shard_fired", (_loaded_memory_resource as MemoryShardResource).id)
	else:
		push_warning("Loaded resource is not a MemoryShardResource. Degradation not applied.")
		emit_signal("shard_fired", "unknown_id")

	_loaded_shard_node = null
	_loaded_memory_resource = null

func _setup_shard_material(shard_node: RigidBody3D):
	for child in shard_node.get_children():
		if child is MeshInstance3D:
			var material = ShaderMaterial.new()
			var shader = Shader.new()
			shader.code = SHARD_DEGRADE_SHADER_CODE
			material.shader = shader
			
			# Copy existing albedo texture if available
			if child.get_active_material(0) is StandardMaterial3D:
				var std_mat = child.get_active_material(0) as StandardMaterial3D
				if std_mat.albedo_texture:
					material.set_shader_parameter("albedo_texture", std_mat.albedo_texture)
			
			material.set_shader_parameter("degradation_color", shard_degradation_color)
			material.set_shader_parameter("degradation_noise_scale", shard_degradation_noise_scale)
			material.set_shader_parameter("degradation_edge_sharpness", shard_degradation_edge_sharpness)
			material.set_shader_parameter("degradation_amount", 0.0) # Start with no degradation
			child.set_surface_override_material(0, material)

			# Add GPUParticles3D for memory bleed effect
			var particles = GPUParticles3D.new()
			shard_node.add_child(particles)
			particles.emitting = false # Will be activated on fire
			particles.lifetime = 1.0
			particles.amount = 32
			particles.one_shot = true
			particles.process_material = ParticlesMaterial.new() # Default material for now
			particles.process_material.emission_shape = ParticlesMaterial.EMISSION_SHAPE_SPHERE
			particles.process_material.emission_sphere_radius = 0.1
			particles.process_material.direction = Vector3(0, 1, 0) # Example direction
			particles.process_material.spread = 180.0
			particles.process_material.initial_velocity_min = 1.0
			particles.process_material.initial_velocity_max = 2.0
			particles.process_material.color = shard_degradation_color
			particles.process_material.color_ramp = Gradient.new() # Simple gradient
			particles.process_material.color_ramp.add_point(0.0, shard_degradation_color)
			particles.process_material.color_ramp.add_point(1.0, Color(shard_degradation_color.r, shard_degradation_color.g, shard_degradation_color.b, 0.0))
			particles.name = "MemoryBleedParticles"
			break # Assume only one MeshInstance3D per shard for simplicity

func _apply_degradation_effect(shard_node: RigidBody3D, degradation_amount: float):
	for child in shard_node.get_children():
		if child is MeshInstance3D:
			var material = child.get_active_material(0)
			if material is ShaderMaterial:
				material.set_shader_parameter("degradation_amount", degradation_amount)
			
			# Activate particles
			var particles = shard_node.find_child("MemoryBleedParticles") as GPUParticles3D
			if particles:
				particles.emitting = true
			break
