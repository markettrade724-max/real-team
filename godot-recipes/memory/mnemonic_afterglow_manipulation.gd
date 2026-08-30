@tool
extends Node3D

@export var afterglow_particle_scene: PackedScene # Scene with GPUParticles3D configured
@export var afterglow_lifetime: float = 3.0 # Base duration for afterglow instance
@export var shield_duration: float = 1.5 # Duration for shield mode
@export var projectile_speed: float = 20.0 # Speed for projectile mode
@export var platform_duration: float = 2.0 # Duration for platform mode
@export var afterglow_base_color: Color = Color("00aaff") # Starting color for particles
@export var afterglow_fade_color: Color = Color("aa00ff") # Ending color for particles

var _active_afterglows: Array[GPUParticles3D] = []

func spawn_afterglow(position: Vector3) -> GPUParticles3D:
	var afterglow_instance: GPUParticles3D = afterglow_particle_scene.instantiate()
	add_child(afterglow_instance)
	afterglow_instance.global_position = position
	
	# Configure shader material parameters
	if afterglow_instance.process_material is ShaderMaterial:
		var material: ShaderMaterial = afterglow_instance.process_material
		material.set_shader_parameter("base_color", afterglow_base_color)
		material.set_shader_parameter("fade_color", afterglow_fade_color)
		material.set_shader_parameter("distortion_strength", 0.0) # Reset distortion
	
	afterglow_instance.emitting = true
	_active_afterglows.append(afterglow_instance)
	
	# Tween for base afterglow fade and free
	var tween: Tween = create_tween()
	tween.tween_interval(afterglow_lifetime)
	tween.tween_callback(Callable(self, "_on_afterglow_faded").bind(afterglow_instance))
	
	return afterglow_instance

func activate_shield(afterglow_node: GPUParticles3D, player_node: Node3D):
	# Ensure afterglow_node is a child of player_node for relative positioning
	if afterglow_node.get_parent() != player_node:
		afterglow_node.get_parent().remove_child(afterglow_node)
		player_node.add_child(afterglow_node)
	afterglow_node.global_position = player_node.global_position # Position around player
	
	# Visual effect for shield: increase distortion
	if afterglow_node.process_material is ShaderMaterial:
		var material: ShaderMaterial = afterglow_node.process_material
		material.set_shader_parameter("distortion_strength", 0.7)
	
	# Add temporary collision for shield
	var shield_area: Area3D = Area3D.new()
	player_node.add_child(shield_area)
	shield_area.name = "AfterglowShieldArea"
	
	var shield_shape: CollisionShape3D = CollisionShape3D.new()
	shield_area.add_child(shield_shape)
	shield_shape.shape = SphereShape3D.new()
	(shield_shape.shape as SphereShape3D).radius = 2.0 # Example size
	
	var tween: Tween = create_tween()
	tween.tween_property(afterglow_node.process_material, "shader_parameter/distortion_strength", 0.0, shield_duration)
	tween.tween_callback(Callable(shield_area, "queue_free"))
	tween.tween_callback(Callable(afterglow_node, "queue_free")) # Shield consumes the afterglow
	
func launch_projectile(afterglow_node: GPUParticles3D, direction: Vector3):
	# Make afterglow_node a temporary RigidBody3D for physics
	var projectile_body: RigidBody3D = RigidBody3D.new()
	afterglow_node.get_parent().remove_child(afterglow_node)
	add_child(projectile_body)
	projectile_body.global_position = afterglow_node.global_position
	projectile_body.add_child(afterglow_node)
	afterglow_node.global_position = Vector3.ZERO # Reset local position
	
	var projectile_shape: CollisionShape3D = CollisionShape3D.new()
	projectile_body.add_child(projectile_shape)
	projectile_shape.shape = SphereShape3D.new()
	(projectile_shape.shape as SphereShape3D).radius = 0.5
	
	projectile_body.linear_velocity = direction.normalized() * projectile_speed
	
	var tween: Tween = create_tween()
	tween.tween_interval(afterglow_lifetime) # Projectile lasts as long as afterglow
	tween.tween_callback(Callable(projectile_body, "queue_free")) # Free body and its children

func create_platform(afterglow_node: GPUParticles3D, position: Vector3):
	var platform_body: StaticBody3D = StaticBody3D.new()
	add_child(platform_body)
	platform_body.global_position = position
	
	var platform_shape: CollisionShape3D = CollisionShape3D.new()
	platform_body.add_child(platform_shape)
	platform_shape.shape = BoxShape3D.new()
	(platform_shape.shape as BoxShape3D).size = Vector3(3.0, 0.5, 3.0) # Example platform size
	
	# Parent afterglow to platform and adjust visual
	afterglow_node.get_parent().remove_child(afterglow_node)
	platform_body.add_child(afterglow_node)
	afterglow_node.global_position = Vector3.ZERO # Reset local position
	
	if afterglow_node.process_material is ShaderMaterial:
		var material: ShaderMaterial = afterglow_node.process_material
		material.set_shader_parameter("distortion_strength", 0.9) # Make it look solid
	
	var tween: Tween = create_tween()
	tween.tween_property(afterglow_node.process_material, "shader_parameter/distortion_strength", 0.0, platform_duration)
	tween.tween_callback(Callable(platform_body, "queue_free")) # Free platform and its children

func _on_afterglow_faded(afterglow_node: GPUParticles3D):
	if afterglow_node in _active_afterglows:
		_active_afterglows.erase(afterglow_node)
	if is_instance_valid(afterglow_node):
		afterglow_node.queue_free()
