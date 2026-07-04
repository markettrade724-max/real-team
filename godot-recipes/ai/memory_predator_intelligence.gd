extends Node

# Signals for Lyra's interactions, observed by this system
signal memory_fragment_interacted(fragment_id: String, interaction_type: String, memory_type: String)
signal memory_fragment_lost(fragment_id: String, memory_type: String)

var lyra_memory_profile: Dictionary = {
	"recovered_memories": {}, # {fragment_id: {type: "joy", value: 0.7}}
	"lost_memories": {},      # {fragment_id: {type: "grief", value: 0.5}}
	"memory_attachments": {}, # {memory_type: attachment_score} e.g., {"joy": 0.8, "family": 0.9}
	"memory_priorities": {},  # {memory_type: priority_score}
}

func _ready():
	# Example: Connect to Lyra's interaction signals from a central game manager or Lyra's script.
	# get_tree().get_first_node_in_group("Lyra").memory_fragment_interacted.connect(self._on_memory_fragment_interacted)
	# get_tree().get_first_node_in_group("Lyra").memory_fragment_lost.connect(self._on_memory_fragment_lost)
	pass

# Updates Lyra's memory profile based on her actions
func _on_memory_fragment_interacted(fragment_id: String, interaction_type: String, memory_type: String):
	if interaction_type == "recover":
		lyra_memory_profile.recovered_memories[fragment_id] = {"type": memory_type, "value": 1.0} # Simplified value
	elif interaction_type == "prioritize":
		lyra_memory_profile.memory_priorities[memory_type] = lyra_memory_profile.memory_priorities.get(memory_type, 0.0) + 0.1
	_update_memory_attachment(memory_type, 0.05) # Small attachment increase

func _on_memory_fragment_lost(fragment_id: String, memory_type: String):
	lyra_memory_profile.lost_memories[fragment_id] = {"type": memory_type, "value": 1.0} # Mark as lost
	_update_memory_attachment(memory_type, -0.1) # Attachment might decrease or shift

# Internal helper to adjust attachment scores
func _update_memory_attachment(memory_type: String, change: float):
	lyra_memory_profile.memory_attachments[memory_type] = \
		clampf(lyra_memory_profile.memory_attachments.get(memory_type, 0.5) + change, 0.0, 1.0)

# Generates tactical responses for Silence hunters
func generate_hunter_tactics(hunter_id: String, current_context: Dictionary) -> Dictionary:
	var tactics: Dictionary = {
		"pursuit_strategy": "direct",
		"trap_type": "none",
		"diversion_type": "none",
		"target_memory_type": "none",
		"psychological_pressure": "none"
	}

	var most_attached_memory_type = _get_most_attached_memory_type()
	var most_prioritized_memory_type = _get_most_prioritized_memory_type()
	var lost_memory_count = lyra_memory_profile.lost_memories.size()

	# Prioritize attacking what Lyra cares about or has lost
	if most_attached_memory_type != "none":
		tactics.target_memory_type = most_attached_memory_type
		tactics.psychological_pressure = "threaten_attachment"
		if randf() < 0.6: # Chance to set a trap related to this memory
			tactics.trap_type = "memory_trap_" + most_attached_memory_type
			tactics.diversion_type = "illusion_" + most_attached_memory_type

	# If Lyra has lost many memories, use them against her
	if lost_memory_count > 3 and randf() < 0.4:
		var lost_memory_ids = lyra_memory_profile.lost_memories.keys()
		var random_lost_memory_id = lost_memory_ids[randi() % lost_memory_ids.size()]
		var lost_memory_data = lyra_memory_profile.lost_memories[random_lost_memory_id]
		tactics.diversion_type = "phantom_" + lost_memory_data.type
		tactics.psychological_pressure = "exploit_grief"

	# Contextual adjustments (simplified)
	if current_context.get("danger_level", 0.0) > 0.7:
		tactics.pursuit_strategy = "aggressive"
	elif current_context.get("memory_density", 0.0) > 0.5 and most_prioritized_memory_type != "none":
		tactics.pursuit_strategy = "intercept_priority_memory"

	return tactics

# Helper to find the memory type Lyra is most attached to
func _get_most_attached_memory_type() -> String:
	var highest_score = -1.0
	var type_name = "none"
	for mem_type in lyra_memory_profile.memory_attachments:
		if lyra_memory_profile.memory_attachments[mem_type] > highest_score:
			highest_score = lyra_memory_profile.memory_attachments[mem_type]
			type_name = mem_type
	return type_name

# Helper to find the memory type Lyra prioritizes most
func _get_most_prioritized_memory_type() -> String:
	var highest_score = -1.0
	var type_name = "none"
	for mem_type in lyra_memory_profile.memory_priorities:
		if lyra_memory_profile.memory_priorities[mem_type] > highest_score:
			highest_score = lyra_memory_profile.memory_priorities[mem_type]
			type_name = mem_type
	return type_name
