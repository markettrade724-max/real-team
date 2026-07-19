extends CharacterBody3D

@export var player_node_path: NodePath
@export var mnemopath_history_length: int = 60 # Number of past positions to store (e.g., 1 second at 60 physics frames)
@export var prediction_time_ahead: float = 1.0 # How many seconds into the future to predict Lyra's path
@export var ambush_detection_radius: float = 2.0 # Radius around a mnemopath point for ambush detection
@export var hunter_speed: float = 5.0 # Speed of the hunter
@export var ambush_cooldown: float = 5.0 # Cooldown in seconds before another ambush can be triggered

var _player: CharacterBody3D
var _navigation_agent: NavigationAgent3D
var _mnemopath_history: Array[Vector3] = []
var _last_ambush_position: Vector3 = Vector3.INF
var _ambush_timer: float = 0.0

func _ready() -> void:
	_player = get_node_or_null(player_node_path)
	if not _player:
		push_error("MnemopathHunterAI: Player node not found at path %s" % player_node_path)
		set_process(false)
		return

	_navigation_agent = NavigationAgent3D.new()
	add_child(_navigation_agent)
	_navigation_agent.path_desired_distance = 0.5
	_navigation_agent.target_desired_distance = 0.5
	_navigation_agent.velocity_computed.connect(_on_velocity_computed)

func _physics_process(delta: float) -> void:
	_update_mnemopath_history()
	_ambush_timer = max(0.0, _ambush_timer - delta)

	if _ambush_timer <= 0.0:
		_check_for_ambush()

	_move_hunter()

func _update_mnemopath_history() -> void:
	# Add current player position to history
	_mnemopath_history.push_back(_player.global_position)
	# Keep history length in check
	while _mnemopath_history.size() > mnemopath_history_length:
		_mnemopath_history.pop_front()

func _check_for_ambush() -> void:
	var player_velocity: Vector3 = (_player as CharacterBody3D).velocity if _player is CharacterBody3D else Vector3.ZERO
	var predicted_player_position: Vector3 = _player.global_position + player_velocity * prediction_time_ahead

	for mnemopath_point in _mnemopath_history:
		if predicted_player_position.distance_to(mnemopath_point) < ambush_detection_radius:
			_trigger_ambush(mnemopath_point)
			return # Trigger only one ambush per check cycle

func _trigger_ambush(ambush_point: Vector3) -> void:
	# Only trigger if significantly far from the last ambush point to avoid spamming same spot
	if _last_ambush_position.distance_to(ambush_point) > ambush_detection_radius * 2:
		_navigation_agent.target_position = ambush_point
		_last_ambush_position = ambush_point
		_ambush_timer = ambush_cooldown
		# In a real game, this would involve spawning a hunter, playing an animation, etc.
		# For this recipe, setting target_position is the "manifestation".
		print("Ambush triggered at: %s" % ambush_point)

func _move_hunter() -> void:
	if not _navigation_agent.is_navigation_finished():
		var next_path_position: Vector3 = _navigation_agent.get_next_path_position()
		var direction: Vector3 = global_position.direction_to(next_path_position)
		var desired_velocity: Vector3 = direction * hunter_speed
		_navigation_agent.set_velocity(desired_velocity)
	else:
		_navigation_agent.set_velocity(Vector3.ZERO) # Stop if target reached

func _on_velocity_computed(safe_velocity: Vector3) -> void:
	velocity = safe_velocity
	move_and_slide()