extends CharacterBody3D

# Exported variables for tuning the kinetic memory flux mechanics
@export var throw_force_magnitude: float = 25.0
@export var boost_velocity_magnitude: float = 15.0
@export var tether_max_distance: float = 10.0
@export var throw_identity_cost: float = 0.05
@export var boost_identity_cost: float = 0.1
@export var tether_identity_cost_per_second: float = 0.02

# Internal state variables for managing identity and tethering
var _current_identity: float = 1.0 # Represents Lyra's identity, 1.0 is full, 0.0 is lost
var _tethered_fragment: RigidBody3D = null
var _tether_joint: PinJoint3D = null

func _physics_process(delta: float) -> void:
	# Apply continuous identity cost if Lyra is currently tethered to a memory fragment
	if is_instance_valid(_tethered_fragment):
		_apply_identity_cost(tether_identity_cost_per_second * delta)

func throw_memory_fragment(fragment: RigidBody3D, direction: Vector3) -> void:
	# Throws a memory fragment, applying an impulse to it.
	# An identity cost is incurred for this action.
	if not is_instance_valid(fragment) or fragment == _tethered_fragment:
		return

	PhysicsServer3D.body_apply_impulse(
		fragment.get_rid(),
		direction.normalized() * throw_force_magnitude,
		Vector3.ZERO # Apply impulse at the fragment's center of mass
	)
	_apply_identity_cost(throw_identity_cost)

func kinetic_boost(fragment: RigidBody3D) -> void:
	# Propels Lyra upwards by 'boosting' off a memory fragment beneath her.
	# This action incurs an identity cost.
	if not is_instance_valid(fragment):
		return

	# Directly modify Lyra's vertical velocity for an immediate boost effect
	velocity.y = boost_velocity_magnitude
	_apply_identity_cost(boost_identity_cost)

func start_kinetic_tether(fragment: RigidBody3D) -> void:
	# Initiates a kinetic tether, connecting Lyra to a memory fragment with a PinJoint3D.
	# A continuous identity cost is applied while tethered.
	if not is_instance_valid(fragment) or is_instance_valid(_tether_joint):
		return

	_tether_joint = PinJoint3D.new()
	add_child(_tether_joint) # Add the joint as a child of Lyra for proper scene management

	_tether_joint.node_a = get_path() # Lyra's path
	_tether_joint.node_b = fragment.get_path() # Fragment's path

	_tether_joint.position_a = Vector3.ZERO # Anchor point on Lyra (center)
	_tether_joint.position_b = Vector3.ZERO # Anchor point on fragment (center)

	_tether_joint.set_param(PinJoint3D.PARAM_BIAS, 0.1)
	_tether_joint.set_param(PinJoint3D.PARAM_DAMPING, 0.5)
	_tether_joint.set_param(PinJoint3D.PARAM_IMPULSE_CLAMP, 100.0)

	_tether_joint.set_param(PinJoint3D.PARAM_LIMIT_ENABLED, true)
	_tether_joint.set_param(PinJoint3D.PARAM_LIMIT_LOWER, 0.0)
	_tether_joint.set_param(PinJoint3D.PARAM_LIMIT_UPPER, tether_max_distance)

	_tethered_fragment = fragment
	_apply_identity_cost(tether_identity_cost_per_second * 0.5) # Small initial cost for tethering

func end_kinetic_tether() -> void:
	# Releases the kinetic tether, removing the PinJoint3D.
	if is_instance_valid(_tether_joint):
		_tether_joint.queue_free()
		_tether_joint = null
	_tethered_fragment = null

func get_current_identity() -> float:
	# Returns Lyra's current identity level.
	return _current_identity

func _apply_identity_cost(cost: float) -> void:
	# Decreases Lyra's identity level by the specified cost.
	# If identity reaches zero, the tether is released.
	_current_identity = max(0.0, _current_identity - cost)
	if _current_identity <= 0.0:
		# Placeholder for game over or critical memory loss consequence
		print("Lyra's identity is fully lost!")
		end_kinetic_tether() # Ensure tether is released if identity is lost
