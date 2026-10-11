	# filename: mnemonic_echo_reversion.gd
	extends Area3D

	@export_range(1.0, 50.0, 0.1) var reversion_radius: float = 10.0
	@export_range(1.0, 30.0, 0.1) var ghost_duration: float = 5.0
	@export var ghost_enemy_scene: PackedScene # Scene for temporary ghost enemies
	@export var is_one_time_use: bool = true

	var _affected_nodes_data: Dictionary = {} # Stores initial states of nodes
	var _is_active: bool = true

	func _ready() -> void:
		# Ensure the Area3D has a collision shape for detection
		if get_node_or_null("CollisionShape3D") == null:
			push_warning("MemoryShard requires a CollisionShape3D child.")
			set_deferred("monitorable", false)
			set_deferred("monitoring", false)
			return

		# Set up the Area3D to detect Lyra (assuming Lyra is a CharacterBody3D in "player" group)
		body_entered.connect(_on_body_entered)

		# Capture initial states of relevant nodes in the scene.
		# This happens once when the shard is ready, representing the "past" state.
		_capture_initial_states()

	func _capture_initial_states() -> void:
		var root_node = get_tree().root
		var nodes_to_check: Array[Node] = []
		nodes_to_check.append_array(root_node.find_children("*", "revertible_prop", true, false))
		nodes_to_check.append_array(root_node.find_children("*", "revertible_enemy", true, false))
		nodes_to_check.append_array(root_node.find_children("*", "revertible_trap", true, false))

		for node in nodes_to_check:
			if node is Node3D and global_position.distance_to(node.global_position) <= reversion_radius:
				var node_path = node.get_path()
				_affected_nodes_data[node_path] = {
					"position": node.global_position,
					"rotation": node.global_rotation,
					"visible": node.visible,
					"material": null,
					"collision_shape_data": null,
					"is_enemy": node.is_in_group("revertible_enemy"),
					"is_trap": node.is_in_group("revertible_trap"),
					"trap_active_state": false
				}

				if node is MeshInstance3D:
					_affected_nodes_data[node_path]["material"] = node.get_active_material(0)

				if node is StaticBody3D or node is RigidBody3D:
					for child in node.get_children():
						if child is CollisionShape3D:
							_affected_nodes_data[node_path]["collision_shape_data"] = {
								"shape": child.shape,
								"position": child.position,
								"rotation": child.rotation
							}
							break

				if node.is_in_group("revertible_trap") and node.has_method("get_is_active"):
					_affected_nodes_data[node_path]["trap_active_state"] = node.get_is_active()

	func _on_body_entered(body: Node3D) -> void:
		if _is_active and body.is_in_group("player"):
			_perform_reversion()
			if is_one_time_use:
				_is_active = false
				set_deferred("monitoring", false)
				set_deferred("monitorable", false)
				visible = false

	func _perform_reversion() -> void:
		for node_path_str in _affected_nodes_data:
			var node_data = _affected_nodes_data[node_path_str]
			var node = get_node_or_null(NodePath(node_path_str))

			if node:
				node.global_position = node_data["position"]
				node.global_rotation = node_data["rotation"]
				node.visible = node_data["visible"]

				if node is MeshInstance3D and node_data["material"]:
					node.set_surface_override_material(0, node_data["material"])

				if (node is StaticBody3D or node is RigidBody3D) and node_data["collision_shape_data"]:
					for child in node.get_children():
						if child is CollisionShape3D:
							child.shape = node_data["collision_shape_data"]["shape"]
							child.position = node_data["collision_shape_data"]["position"]
							child.rotation = node_data["collision_shape_data"]["rotation"]
							break

				if node.is_in_group("revertible_trap") and node.has_method("set_is_active"):
					node.set_is_active(node_data["trap_active_state"])

			elif node_data["is_enemy"] and ghost_enemy_scene:
				var ghost_instance = ghost_enemy_scene.instantiate()
				get_tree().root.add_child(ghost_instance)
				ghost_instance.global_position = node_data["position"]
				ghost_instance.global_rotation = node_data["rotation"]

				var timer = get_tree().create_timer(ghost_duration, false)
				timer.timeout.connect(ghost_instance.queue_free)
