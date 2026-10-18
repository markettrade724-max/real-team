extends Area3D
class_name WhisperEaterBlade

signal memory_consumed(buff_data: Dictionary, identity_cost_key: String)

@export var blade_damage: float = 15.0
@export var buff_duration: float = 5.0 # seconds
@export var buff_speed_multiplier: float = 0.1 # Multiplier for speed buff based on memory_value
@export var buff_damage_multiplier: float = 0.2 # Multiplier for damage buff based on memory_value
@export var buff_shield_strength_multiplier: float = 0.5 # Multiplier for shield strength buff based on memory_value
@export var fragment_detection_radius: float = 2.0 # Units, radius to detect MemoryFragment nodes
@export var memory_fragment_group: String = "memory_fragments"
@export var enemy_group: String = "enemies"

var _is_attacking: bool = false # Controls if the blade can deal damage and consume memories

func _ready() -> void:
	# Connect to the body_entered signal to detect when the blade's collision shape hits a physics body.
	body_entered.connect(_on_body_entered)

func set_attacking(attacking: bool) -> void:
	# This method should be called by the player's animation system
	# to enable/disable the blade's active state during an attack animation.
	_is_attacking = attacking

func _on_body_entered(body: Node3D) -> void:
	# Only process hits if the blade is currently in an attacking state.
	if not _is_attacking:
		return

	# Check if the collided body is an enemy and has a method to take damage.
	if body.is_in_group(enemy_group) and body.has_method("take_damage"):
		# Apply damage to the enemy.
		body.take_damage(blade_damage)
		
		# Attempt to find and consume a nearby MemoryFragment.
		var consumed_fragment = _find_and_consume_nearby_fragment()
		if consumed_fragment:
			_apply_memory_cost_and_buff(consumed_fragment)
			# Optionally, reset _is_attacking here if only one memory can be consumed per attack swing.
			# If multiple hits/consumptions are desired per swing, this should be managed externally.
			_is_attacking = false # Prevent multiple consumptions/buffs from a single attack frame

func _find_and_consume_nearby_fragment() -> Node:
	# Get all nodes in the 'memory_fragments' group.
	var fragments_in_scene = get_tree().get_nodes_in_group(memory_fragment_group)
	var closest_fragment: Node = null
	var min_distance_sq: float = fragment_detection_radius * fragment_detection_radius

	# Iterate through fragments to find the closest one within the detection radius.
	for fragment_node in fragments_in_scene:
		# Ensure the node is a MemoryFragment (or has the expected properties/methods).
		if fragment_node.has_method("consume") and fragment_node.has_method("get_memory_value") and fragment_node.has_method("get_identity_data_key"):
			var distance_sq = global_position.distance_squared_to(fragment_node.global_position)
			if distance_sq < min_distance_sq:
				min_distance_sq = distance_sq
				closest_fragment = fragment_node

	# If a fragment was found, consume it.
	if closest_fragment:
		closest_fragment.consume() # Trigger the fragment's self-destruction/visual effect.
		return closest_fragment
	return null

func _apply_memory_cost_and_buff(fragment: Node) -> void:
	# Calculate buff data based on the consumed fragment's memory value.
	var memory_value = fragment.get_memory_value()
	var buff_data: Dictionary = {
		"speed_boost": memory_value * buff_speed_multiplier,
		"damage_boost": memory_value * buff_damage_multiplier,
		"shield_strength": memory_value * buff_shield_strength_multiplier,
		"duration": buff_duration
	}
	
	# Emit signal to notify other systems (e.g., PlayerStats, IdentitySystem) of the consumption.
	emit_signal("memory_consumed", buff_data, fragment.get_identity_data_key())
