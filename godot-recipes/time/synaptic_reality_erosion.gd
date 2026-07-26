	@tool
	extends StaticBody3D

	export var identity_integrity: float = 1.0:
		set(value):
			identity_integrity = clampf(value, 0.0, 1.0)
			_update_erosion_state()

	export var erosion_rate: float = 0.05 # How fast integrity drops per second when below 1.0
	export var reinforce_duration: float = 3.0 # How long reinforcement lasts
	export var max_erosion_shrink_factor: float = 0.5 # Max collision shrink (0.0 = no shrink, 1.0 = full shrink)

	@onready var mesh_instance: MeshInstance3D = $"MeshInstance3D"
	@onready var collision_shape: CollisionShape3D = $"CollisionShape3D"

	var _initial_collision_extents: Vector3
	var _erosion_shader_material: ShaderMaterial
	var _is_reinforced: bool = false
	var _reinforce_timer: float = 0.0


	func _ready() -> void:
		if Engine.is_editor_hint():
			return

		if collision_shape and collision_shape.shape is BoxShape3D:
			_initial_collision_extents = (collision_shape.shape as BoxShape3D).extents
		else:
			push_warning("CollisionShape3D not found or not a BoxShape3D. Erosion will not affect collision.")

		_erosion_shader_material = ShaderMaterial.new()
		var shader_resource = load("res://fading_erosion_shader.gdshader")
		if shader_resource:
			_erosion_shader_material.shader = shader_resource
			if mesh_instance:
				mesh_instance.material_override = _erosion_shader_material
			else:
				push_warning("MeshInstance3D not found. Erosion will only affect collision.")

		_update_erosion_state()


	func _process(delta: float) -> void:
		if Engine.is_editor_hint():
			return

		if not _is_reinforced and identity_integrity > 0.0:
			# Simulate continuous erosion if not reinforced
			identity_integrity -= erosion_rate * delta
			# The setter will call _update_erosion_state()

		if _is_reinforced:
			_reinforce_timer -= delta
			if _reinforce_timer <= 0.0:
				_is_reinforced = false
				_update_erosion_state()


	func _update_erosion_state() -> void:
		var current_integrity = identity_integrity
		if _is_reinforced:
			current_integrity = 1.0 # Fully solid when reinforced

		var erosion_factor = 1.0 - current_integrity # 0.0 = solid, 1.0 = fully eroded

		if collision_shape and collision_shape.shape is BoxShape3D:
			var target_extents = _initial_collision_extents * (1.0 - erosion_factor * max_erosion_shrink_factor)
			(collision_shape.shape as BoxShape3D).extents = target_extents
			collision_shape.set_deferred("disabled", erosion_factor >= 0.99) # Disable collision if almost fully eroded

		if _erosion_shader_material:
			_erosion_shader_material.set_shader_parameter("fade_amount", erosion_factor)


	func reinforce_platform() -> void:
		_is_reinforced = true
		_reinforce_timer = reinforce_duration
		_update_erosion_state()
