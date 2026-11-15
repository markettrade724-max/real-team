class_name MnemonicActionReversal extends Node

# Stores recorded states for actions linked to memory IDs.
# Format: { "memory_id": [ { "node": Node3D, "initial_transform": Transform3D, "initial_visible": bool }, ... ] }
var _recorded_actions: Dictionary = {}

func _ready() -> void:
	pass # This node is designed to be managed by a game manager or as a singleton.

# Records the current state of a Node3D before an action is performed.
# This state includes its transform (position, rotation, scale) and visibility.
func record_action_state(node: Node3D, memory_id: String) -> void:
	if not _recorded_actions.has(memory_id):
		_recorded_actions[memory_id] = []

	# Store the current transform and visibility of the node.
	_recorded_actions[memory_id].append({
		"node": node,
		"initial_transform": node.transform,
		"initial_visible": node.visible
	})

# Applies an action to a Node3D, moving it to a target transform over a duration.
# This function is typically called immediately after record_action_state.
func apply_action(node: Node3D, target_transform: Transform3D, duration: float = 0.5) -> void:
	var tween: Tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_QUAD)
	tween.tween_property(node, "transform", target_transform, duration)

# Reverses all actions associated with a given memory ID.
# Nodes linked to the lost memory will tween back to their initial recorded state.
func reverse_action(memory_id: String, duration: float = 0.5) -> void:
	if not _recorded_actions.has(memory_id):
		return # No recorded actions for this memory ID.

	var actions_to_reverse: Array = _recorded_actions[memory_id]
	for action_data in actions_to_reverse:
		var node: Node3D = action_data["node"]
		var initial_transform: Transform3D = action_data["initial_transform"]
		var initial_visible: bool = action_data["initial_visible"]

		if is_instance_valid(node):
			var tween: Tween = create_tween()
			tween.set_ease(Tween.EASE_IN) # EASE_IN for reversal to give a sense of being pulled back.
			tween.set_trans(Tween.TRANS_QUAD)
			tween.tween_property(node, "transform", initial_transform, duration)
			tween.tween_property(node, "visible", initial_visible, duration)
		else:
			# Handle cases where the node might have been removed from the scene tree.
			pass

	_recorded_actions.erase(memory_id) # The memory is lost, so its associated actions are no longer reversible.

# Clears all currently recorded actions.
# Useful for resetting the system, e.g., when starting a new level or game.
func clear_all_actions() -> void:
	_recorded_actions.clear()
