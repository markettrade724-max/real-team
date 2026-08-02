class_name MnemosyneHunter extends CharacterBody3D

# Lyra's memory profile: keys are memory identifiers, values indicate state (e.g., true for active, false for lost)
var lyra_memory_profile: Dictionary = {}

# Internal AI parameters adapted based on Lyra's profile
var _behavior_exploit_heights: bool = false
var _behavior_exploit_darkness: bool = false
var _behavior_aggressive_flank: bool = false
var _target_player: Node3D # Reference to Lyra

func _ready() -> void:
	# Placeholder for finding Lyra, in a real game this would be more robust
	_target_player = get_tree().get_first_node_in_group("player")
	if _target_player == null:
		push_warning("MnemosyneHunter: Player not found in 'player' group.")

func _physics_process(delta: float) -> void:
	if _target_player == null:
		return

	_update_behavior()
	_execute_current_behavior(delta)

# Updates internal AI parameters based on Lyra's current memory profile.
func _update_behavior() -> void:
	# Reset behaviors
	_behavior_exploit_heights = false
	_behavior_exploit_darkness = false
	_behavior_aggressive_flank = false

	# Adapt based on lost memories (exploiting weaknesses)
	if lyra_memory_profile.get("trust_high_places") == false: # Lyra lost trust in high places
		_behavior_exploit_heights = true
	if lyra_memory_profile.get("courage") == false: # Lyra lost courage
		_behavior_aggressive_flank = true

	# Adapt based on active fears (exploiting existing fears)
	if lyra_memory_profile.get("fear_darkness") == true: # Lyra fears darkness
		_behavior_exploit_darkness = true

	# Add more adaptation rules here based on other memory fragments

# Executes the hunter's actions based on its current adapted behaviors.
func _execute_current_behavior(delta: float) -> void:
	var direction: Vector3 = Vector3.ZERO
	var speed: float = 5.0

	# Prioritize exploiting specific weaknesses/fears
	if _behavior_exploit_heights and _is_player_near_ledge():
		# Attempt to push player off ledge (simplified)
		direction = (_target_player.global_position - global_position).normalized()
		speed = 7.0 # Increase speed for a charge
	elif _behavior_exploit_darkness and _is_player_in_dark_area():
		# Try to lure or corner player in darkness
		direction = (_target_player.global_position - global_position).normalized()
		speed = 4.0 # Slower, more tactical approach
	elif _behavior_aggressive_flank:
		# Attempt to flank the player (simplified)
		var player_forward = -_target_player.global_transform.basis.z
		var flank_offset = player_forward.rotated(Vector3.UP, PI / 2) * 5.0 # Try to move to player's side
		direction = ((_target_player.global_position + flank_offset) - global_position).normalized()
		speed = 6.0
	else:
		# Default pursuit behavior
		direction = (_target_player.global_position - global_position).normalized()
		speed = 5.0

	velocity = direction * speed
	move_and_slide()

# Sets Lyra's current memory profile, triggering behavior adaptation.
func set_lyra_memory_profile(profile_data: Dictionary) -> void:
	lyra_memory_profile = profile_data
	_update_behavior() # Immediately update behavior when profile changes

# Placeholder: Check if player is near a ledge.
func _is_player_near_ledge() -> bool:
	# Raycast down from player to check for ground, or check environment tags
	# For simplicity, just a dummy check
	return global_position.distance_to(_target_player.global_position) < 10.0 and _target_player.global_position.y > global_position.y + 2.0

# Placeholder: Check if player is in a dark area.
func _is_player_in_dark_area() -> bool:
	# Check light levels around player, or area tags
	# For simplicity, just a dummy check
	return global_position.distance_to(_target_player.global_position) < 8.0 and randf() < 0.5 # 50% chance if close