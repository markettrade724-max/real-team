	# mnemonic_temporal_vestige.gd
	extends Node3D

	@export var vestige_packed_scene: PackedScene: # The scene representing the memory-state to manifest.
		set(value):
			vestige_packed_scene = value
			if not Engine.is_editor_hint(): # Avoid errors in editor if scene is not a Node3D
				if vestige_packed_scene and not vestige_packed_scene.get_state().get_node_type(0) is Node3D:
					push_warning("Vestige scene root must be a Node3D or derived type.")

	@export var vestige_lifetime: float = 5.0 # Duration the temporal vestige remains fully active before decaying.
	@export var vestige_decay_duration: float = 1.0 # Time it takes for the vestige to visually and physically decay.

	var _current_vestige_instance: Node3D = null
	var _decay_tween: Tween = null
	var _lifetime_timer: Timer = null

	func _ready() -> void:
		_lifetime_timer = Timer.new()
		_lifetime_timer.one_shot = true
		_lifetime_timer.autostart = false
		_lifetime_timer.timeout.connect(start_vestige_decay)
		add_child(_lifetime_timer)

	# Activates the temporal vestige, bringing a past memory-state into the present.
	func activate_vestige() -> void:
		if _current_vestige_instance:
			deactivate_vestige()

		if not vestige_packed_scene:
			push_error("No vestige_packed_scene assigned.")
			return

		_current_vestige_instance = vestige_packed_scene.instantiate()
		add_child(_current_vestige_instance)

		_lifetime_timer.wait_time = vestige_lifetime
		_lifetime_timer.start()

	# Initiates the decay process for the active temporal vestige.
	func start_vestige_decay() -> void:
		if not _current_vestige_instance:
			return

		_decay_tween = create_tween()

		# Visually decay the vestige by scaling it down.
		_decay_tween.tween_property(_current_vestige_instance, "scale", Vector3.ZERO, vestige_decay_duration)
		_decay_tween.set_ease(Tween.EASE_IN)

		# Disable collisions halfway through the decay duration for physical interaction change.
		_decay_tween.tween_callback(Callable(self, "_disable_vestige_collisions").bind(true))
		_decay_tween.set_delay(vestige_decay_duration * 0.5)

		_decay_tween.finished.connect(deactivate_vestige)

	# Deactivates and removes the temporal vestige from the scene.
	func deactivate_vestige() -> void:
		if not _current_vestige_instance:
			return

		_lifetime_timer.stop()
		if _decay_tween and _decay_tween.is_running():
			_decay_tween.kill()

		# Ensure collisions are re-enabled in PhysicsServer3D before freeing to clean up state.
		_disable_vestige_collisions(false)
		_current_vestige_instance.queue_free()
		_current_vestige_instance = null

	# Disables or enables collision shapes for all physics bodies within the vestige instance.
	func _disable_vestige_collisions(disable: bool) -> void:
		if not _current_vestige_instance:
			return

		for child in _current_vestige_instance.get_children():
			if child is StaticBody3D or child is RigidBody3D or child is CharacterBody3D:
				var body_rid: RID = child.get_rid()
				for i in range(child.get_shape_count()):
					PhysicsServer3D.body_set_shape_disabled(body_rid, i, disable)
