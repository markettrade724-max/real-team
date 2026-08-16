extends Node3D

@export var desync_enabled: bool = false:
	set(value):
		desync_enabled = value
		if not desync_enabled:
			_reset_desync()

@export_range(0.0, 0.5, 0.01) var desync_lag_time: float = 0.1 # How many seconds behind the visual lags
@export var is_platform: bool = false # If true, applies platform-specific desync logic
@export_range(0.0, 1.0, 0.01) var platform_desync_chance: float = 0.1 # Chance per second for platform collision to momentarily disable

var _transform_history: Array[Transform3D] = []
var _history_capacity: int = 0
var _visual_node: Node3D = null # Reference to the visual mesh node
var _collision_shape_node: CollisionShape3D = null # Reference to the collision shape node (if applicable)
var _parent_body: PhysicsBody3D = null # Reference to the parent physics body

func _ready() -> void:
	_parent_body = get_parent() as PhysicsBody3D
	if not _parent_body:
		push_error("TemporalDesyncObject must be a child of a PhysicsBody3D (RigidBody3D, StaticBody3D, CharacterBody3D).")
		set_process_physics(false)
		return

	# Find visual and collision nodes
	for child in _parent_body.get_children():
		if child is MeshInstance3D or child is MultiMeshInstance3D or child is CSGBox3D:
			_visual_node = child
		if child is CollisionShape3D:
			_collision_shape_node = child

	if not _visual_node:
		push_warning("No visual node found for TemporalDesyncObject. Visual desync will not occur.")
	if not _collision_shape_node and is_platform:
		push_warning("No CollisionShape3D found for platform desync. Platform desync will not occur.")

	_history_capacity = int(desync_lag_time * ProjectSettings.get_setting("physics/common/physics_ticks_per_second")) + 1
	_transform_history.resize(_history_capacity)
	for i in range(_history_capacity):
		_transform_history[i] = _parent_body.global_transform

func _physics_process(delta: float) -> void:
	if not desync_enabled:
		return

	_update_transform_history()
	_apply_visual_desync()
	_apply_platform_desync()

func _update_transform_history() -> void:
	# Shift history, add current transform
	_transform_history.pop_back()
	_transform_history.push_front(_parent_body.global_transform)

func _apply_visual_desync() -> void:
	if _visual_node and _history_capacity > 0:
		# The visual node's transform is set to an older transform from history
		_visual_node.global_transform = _transform_history[min(_history_capacity - 1, _transform_history.size() - 1)]

func _apply_platform_desync() -> void:
	if is_platform and _collision_shape_node and not _collision_shape_node.disabled:
		# This simulates a momentary "ghosting" of the platform's collision
		if randf() < platform_desync_chance * get_physics_process_delta_time():
			_collision_shape_node.disabled = true
			# Use a one-shot timer to re-enable it quickly
			var timer = Timer.new()
			add_child(timer)
			timer.wait_time = 0.02 # Disable for a very short duration (e.g., 2 physics frames at 60 FPS)
			timer.one_shot = true
			timer.timeout.connect(func():
				if is_instance_valid(_collision_shape_node):
					_collision_shape_node.disabled = false
				timer.queue_free()
			)
			timer.start()

func _reset_desync() -> void:
	if _visual_node:
		_visual_node.global_transform = _parent_body.global_transform
	if _collision_shape_node:
		_collision_shape_node.disabled = false
	# Clear any active timers for platform desync
	for child in get_children():
		if child is Timer and not child.is_stopped():
			child.stop()
			child.queue_free()
