extends Node

# Semantic memory anchors and their degradation levels
enum SemanticAnchor {
	GRAVITY_CONCEPT,
	FRICTION_CONCEPT
}

var degradation_levels: Dictionary = {
	SemanticAnchor.GRAVITY_CONCEPT: 0,
	SemanticAnchor.FRICTION_CONCEPT: 0
}

@export_range(0.0, 1.0, 0.01) var gravity_degradation_factor: float = 0.2
@export_range(0.0, 1.0, 0.01) var friction_degradation_factor: float = 0.2
@export var target_physics_material: PhysicsMaterial # Assign a shared PhysicsMaterial resource here

const DEFAULT_GRAVITY: Vector3 = Vector3(0, -9.8, 0)
const DEFAULT_FRICTION: float = 1.0

var _current_gravity: Vector3 = DEFAULT_GRAVITY
var _current_friction: float = DEFAULT_FRICTION

func _ready() -> void:
	# Ensure the manager is in a 3D scene to access World3D
	if not get_world_3d():
		push_error("SemanticDegradationManager requires a World3D context.")
		set_process(false)
		return

	_reset_physics_to_defaults()

func _reset_physics_to_defaults() -> void:
	# Reset all degradation levels
	for key in degradation_levels.keys():
		degradation_levels[key] = 0
	
	# Apply default physics
	_current_gravity = DEFAULT_GRAVITY
	PhysicsServer3D.world_set_default_gravity(get_world_3d().get_space(), _current_gravity)
	
	_current_friction = DEFAULT_FRICTION
	if target_physics_material:
		target_physics_material.friction = _current_friction
	else:
		push_warning("No target_physics_material assigned. Friction degradation will not apply.")

# Call this function when Lyra loses a memory fragment
func lose_memory_fragment(anchor_type: SemanticAnchor) -> void:
	if degradation_levels.has(anchor_type):
		degradation_levels[anchor_type] += 1
		_apply_degradation_effects()
		print("Memory fragment lost: %s. Degradation level: %d" % [SemanticAnchor.keys()[anchor_type], degradation_levels[anchor_type]])
	else:
		push_warning("Attempted to degrade unknown semantic anchor: %s" % SemanticAnchor.keys()[anchor_type])

func _apply_degradation_effects() -> void:
	_update_gravity()
	_update_friction()
	# Emit signals here for visual/auditory feedback (e.g., camera shaders, audio cues)

func _update_gravity() -> void:
	var gravity_degradation_level: int = degradation_levels[SemanticAnchor.GRAVITY_CONCEPT]
	var new_gravity_magnitude: float = DEFAULT_GRAVITY.length() * (1.0 - gravity_degradation_level * gravity_degradation_factor)
	
	# Gravity can reduce in magnitude, or invert if degradation is severe.
	if new_gravity_magnitude < 0.0:
		new_gravity_magnitude = abs(new_gravity_magnitude) # Ensure positive for direction
		_current_gravity = DEFAULT_GRAVITY.normalized() * new_gravity_magnitude * -1.0 # Invert direction
	else:
		_current_gravity = DEFAULT_GRAVITY.normalized() * new_gravity_magnitude
	
	PhysicsServer3D.world_set_default_gravity(get_world_3d().get_space(), _current_gravity)
	print("Gravity updated to: %s" % _current_gravity)

func _update_friction() -> void:
	if not target_physics_material:
		return

	var friction_degradation_level: int = degradation_levels[SemanticAnchor.FRICTION_CONCEPT]
	_current_friction = DEFAULT_FRICTION * (1.0 - friction_degradation_level * friction_degradation_factor)
	_current_friction = max(0.0, _current_friction) # Friction cannot go below zero

	target_physics_material.friction = _current_friction
	print("Friction updated to: %f" % _current_friction)

# Optional: Function to regain a memory (reverse degradation)
func regain_memory_fragment(anchor_type: SemanticAnchor) -> void:
	if degradation_levels.has(anchor_type) and degradation_levels[anchor_type] > 0:
		degradation_levels[anchor_type] -= 1
		_apply_degradation_effects()
		print("Memory fragment regained: %s. Degradation level: %d" % [SemanticAnchor.keys()[anchor_type], degradation_levels[anchor_type]])
