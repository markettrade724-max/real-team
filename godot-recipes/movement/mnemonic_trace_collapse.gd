extends StaticBody3D

@export_category("Collapse Settings")
@export var collapse_delay: float = 1.0 # Time before collapse after player leaves
@export var collapse_duration: float = 2.0 # Time before fragments are removed
@export var fragment_scene: PackedScene # Scene for the collapsing fragments (RigidBody3D)

var _is_player_present: bool = false
var _collapse_timer: Timer
var _original_mesh: MeshInstance3D
var _original_collision: CollisionShape3D

func _ready() -> void:
	_setup_components()
	_setup_area_detection()

func _setup_components() -> void:
	_original_mesh = $MeshInstance3D if has_node("MeshInstance3D") else null
	_original_collision = $CollisionShape3D if has_node("CollisionShape3D") else null

	_collapse_timer = Timer.new()
	add_child(_collapse_timer)
	_collapse_timer.one_shot = true
	_collapse_timer.timeout.connect(_on_collapse_timer_timeout)

func _setup_area_detection() -> void:
	var area: Area3D = $Area3D if has_node("Area3D") else null
	if area:
		area.body_entered.connect(_on_body_entered)
		area.body_exited.connect(_on_body_exited)
	else:
		push_warning("Node requires an Area3D child named 'Area3D' for player detection.")

func _on_body_entered(body: Node3D) -> void:
	if body is CharacterBody3D and body.name == "Lyra":
		_is_player_present = true
		_collapse_timer.stop() # Player re-entered, stop collapse timer

func _on_body_exited(body: Node3D) -> void:
	if body is CharacterBody3D and body.name == "Lyra":
		_is_player_present = false
		_collapse_timer.start(collapse_delay)

func _on_collapse_timer_timeout() -> void:
	if not _is_player_present:
		_trigger_collapse()

func _trigger_collapse() -> void:
	# Disable original collision and mesh
	if _original_mesh:
		_original_mesh.visible = false
	if _original_collision:
		_original_collision.disabled = true

	# Instance and configure fragment scene
	if fragment_scene:
		var fragment_instance: RigidBody3D = fragment_scene.instantiate()
		get_parent().add_child(fragment_instance)
		fragment_instance.global_transform = global_transform

		# Apply initial velocity/rotation for a more dynamic collapse
		fragment_instance.linear_velocity = Vector3(
			randf_range(-2.0, 2.0),
			randf_range(0.0, 5.0), # Slight upward initial push
			randf_range(-2.0, 2.0)
		)
		fragment_instance.angular_velocity = Vector3(
			randf_range(-PI, PI),
			randf_range(-PI, PI),
			randf_range(-PI, PI)
		)

		# Add a timer to remove the fragment after its duration
		var fragment_lifetime_timer = Timer.new()
		fragment_instance.add_child(fragment_lifetime_timer)
		fragment_lifetime_timer.one_shot = true
		fragment_lifetime_timer.timeout.connect(fragment_instance.queue_free)
		fragment_lifetime_timer.start(collapse_duration)
	else:
		push_warning("No fragment_scene provided. Tile will just disappear.")

	# Queue free the original tile after triggering collapse
	queue_free()
