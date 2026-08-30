extends Node

@export var max_history_size: int = 20
@export var ghost_duration: float = 3.0
@export var ghost_collision_layer: int = 2 # Example layer for ghosts
@export var ghost_collision_mask: int = 1 # Example mask (collides with player on layer 1)
@export var default_ghost_extents: Vector3 = Vector3(0.5, 0.5, 0.5) # Default box shape for ghosts

var _history: Array[Dictionary] = []
var _physics_server: PhysicsServer3D

func _ready() -> void:
	_physics_server = PhysicsServer3D.get_singleton()

func record_player_action(transform: Transform3D, linear_velocity: Vector3) -> void:
	# Records Lyra's movement as a potential ghost fragment.
	_add_fragment({"type": "player_move", "transform": transform, "linear_velocity": linear_velocity})

func record_environmental_block(transform: Transform3D, extents: Vector3 = default_ghost_extents) -> void:
	# Records an environmental event (e.g., a collapsing floor) as a potential ghost fragment.
	_add_fragment({"type": "env_block", "transform": transform, "extents": extents})

func _add_fragment(fragment: Dictionary) -> void:
	# Adds a new memory fragment to the history, managing its size.
	_history.push_back(fragment)
	if _history.size() > max_history_size:
		_history.pop_front()

func trigger_memory_flux() -> void:
	# Triggers a memory flux event, creating a physical ghost from a past action.
	if _history.is_empty():
		return

	var fragment_index = randi() % _history.size()
	var fragment = _history[fragment_index]

	var body_rid: RID
	var shape_rid: RID

	match fragment.type:
		"player_move":
			# Create a kinematic body for player movement ghosts (can push/block Lyra).
			body_rid = _physics_server.body_create()
			_physics_server.body_set_mode(body_rid, PhysicsServer3D.BODY_MODE_KINEMATIC)
			_physics_server.body_set_state(body_rid, PhysicsServer3D.BODY_STATE_TRANSFORM, fragment.transform)
			_physics_server.body_set_state(body_rid, PhysicsServer3D.BODY_STATE_LINEAR_VELOCITY, fragment.linear_velocity)
			
			shape_rid = _physics_server.shape_create(PhysicsServer3D.SHAPE_BOX)
			_physics_server.shape_set_data(shape_rid, default_ghost_extents * 2.0) # Box shape expects full dimensions
			_physics_server.body_add_shape(body_rid, shape_rid)
			
			_physics_server.body_set_collision_layer(body_rid, ghost_collision_layer)
			_physics_server.body_set_collision_mask(body_rid, ghost_collision_mask)
			_physics_server.body_set_param(body_rid, PhysicsServer3D.BODY_PARAM_GRAVITY_SCALE, 0.0) # No gravity for player ghosts
			
		"env_block":
			# Create a static body for environmental block ghosts (re-materialized terrain).
			body_rid = _physics_server.body_create()
			_physics_server.body_set_mode(body_rid, PhysicsServer3D.BODY_MODE_STATIC)
			_physics_server.body_set_state(body_rid, PhysicsServer3D.BODY_STATE_TRANSFORM, fragment.transform)
			
			shape_rid = _physics_server.shape_create(PhysicsServer3D.SHAPE_BOX)
			_physics_server.shape_set_data(shape_rid, fragment.extents * 2.0)
			_physics_server.body_add_shape(body_rid, shape_rid)
			
			_physics_server.body_set_collision_layer(body_rid, ghost_collision_layer)
			_physics_server.body_set_collision_mask(body_rid, ghost_collision_mask)
			
		_:
			push_error("Unknown fragment type: ", fragment.type)
			return

	# Schedule the despawning of the ghost object after its duration.
	get_tree().create_timer(ghost_duration).timeout.connect(Callable(self, "_despawn_ghost").bind(body_rid, shape_rid))

func _despawn_ghost(body_rid: RID, shape_rid: RID) -> void:
	# Frees the physics resources associated with a ghost object.
	if _physics_server.is_body_valid(body_rid):
		_physics_server.free_rid(body_rid)
	if _physics_server.is_shape_valid(shape_rid):
		_physics_server.free_rid(shape_rid)
