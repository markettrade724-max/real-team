	# filename: identity_nova_flare.gd
	extends Node3D

	class_name IdentityNovaFlare

	signal identity_depleted
	signal nova_activated(current_identity_level)
	signal debuff_triggered(degradation_level)

	@export var nova_damage: float = 50.0
	@export var nova_radius: float = 5.0
	@export var identity_cost: float = 0.1 # Cost per activation (0.0 to 1.0)
	@export var nova_burst_duration: float = 0.5 # How long the burst animation lasts
	@export var nova_area_active_duration: float = 0.2 # How long Area3D is active
	@export var min_identity_to_use: float = 0.05 # Cannot use if identity is below this
	@export var degradation_multiplier: float = 1.0 # How much identity loss affects visual degradation

	@export var character_mesh_path: NodePath
	@export var particles_node_path: NodePath
	@export var area_node_path: NodePath

	var _current_identity: float = 1.0 # Starts at full identity (0.0 to 1.0)
	var _character_mesh: MeshInstance3D
	var _particles: GPUParticles3D
	var _area: Area3D
	var _nova_active_timer: float = 0.0
	var _burst_animation_timer: float = 0.0

	func _ready() -> void:
		_get_node_references()
		_setup_area()
		_update_shader_degradation()

	func _get_node_references() -> void:
		if character_mesh_path:
			_character_mesh = get_node_or_null(character_mesh_path)
			if not _character_mesh:
				push_error("IdentityNovaFlare: Character MeshInstance3D not found at path: ", character_mesh_path)
		if particles_node_path:
			_particles = get_node_or_null(particles_node_path)
			if not _particles:
				push_error("IdentityNovaFlare: GPUParticles3D not found at path: ", particles_node_path)
		if area_node_path:
			_area = get_node_or_null(area_node_path)
			if not _area:
				push_error("IdentityNovaFlare: Area3D not found at path: ", area_node_path)

	func _setup_area() -> void:
		if _area:
			var shape = SphereShape3D.new()
			shape.radius = nova_radius
			var collision_shape = CollisionShape3D.new()
			collision_shape.shape = shape
			_area.add_child(collision_shape)
			_area.monitoring = false # Start inactive
			_area.body_entered.connect(_on_area_body_entered)

	func _process(delta: float) -> void:
		_update_nova_timers(delta)
		_update_shader_burst_animation(delta)

	func activate_nova() -> bool:
		if _current_identity <= min_identity_to_use:
			identity_depleted.emit()
			return false

		_current_identity = max(0.0, _current_identity - identity_cost)
		_update_shader_degradation()

		if _particles:
			_particles.emitting = true
		if _area:
			_area.monitoring = true
			_nova_active_timer = nova_area_active_duration

		_burst_animation_timer = nova_burst_duration
		_set_shader_burst_amount(1.0) # Start burst

		nova_activated.emit(_current_identity)
		debuff_triggered.emit(1.0 - _current_identity) # Emit degradation level for external debuffs
		return true

	func _update_nova_timers(delta: float) -> void:
		if _nova_active_timer > 0:
			_nova_active_timer -= delta
			if _nova_active_timer <= 0:
				if _area:
					_area.monitoring = false # Deactivate Area3D after duration

	func _update_shader_burst_animation(delta: float) -> void:
		if _burst_animation_timer > 0:
			_burst_animation_timer -= delta
			var progress = _burst_animation_timer / nova_burst_duration
			# Animate from 1.0 down to 0.0
			_set_shader_burst_amount(progress)
		elif _get_shader_burst_amount() > 0.0:
			_set_shader_burst_amount(0.0) # Ensure it's reset

	func _update_shader_degradation() -> void:
		if _character_mesh and _character_mesh.get_active_material(0) is ShaderMaterial:
			var material: ShaderMaterial = _character_mesh.get_active_material(0)
			material.set_shader_parameter("identity_degradation_level", (1.0 - _current_identity) * degradation_multiplier)

	func _set_shader_burst_amount(amount: float) -> void:
		if _character_mesh and _character_mesh.get_active_material(0) is ShaderMaterial:
			var material: ShaderMaterial = _character_mesh.get_active_material(0)
			material.set_shader_parameter("nova_burst_amount", amount)

	func _get_shader_burst_amount() -> float:
		if _character_mesh and _character_mesh.get_active_material(0) is ShaderMaterial:
			var material: ShaderMaterial = _character_mesh.get_active_material(0)
			return material.get_shader_parameter("nova_burst_amount")
		return 0.0

	func _on_area_body_entered(body: Node3D) -> void:
		# Placeholder for damaging logic. Replace with actual enemy damage system.
		if body.has_method("take_damage"):
			body.take_damage(nova_damage)
