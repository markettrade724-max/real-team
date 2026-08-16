extends Node

signal insight_distributed(insight_data)

var _registered_hunters: Array[Node] = []
var _memory_to_insight_map: Dictionary = {
	"stealth_preference": {"detection_range_mod": -0.2, "flanking_mod": 0.1},
	"cover_usage": {"flanking_mod": 0.2, "pursuit_speed_mod": -0.1},
	"escape_route_tendency": {"detection_range_mod": 0.1, "pursuit_speed_mod": 0.1},
	"aggression_tendency": {"flanking_mod": 0.1, "detection_range_mod": 0.1}
}

func _ready() -> void:
	# Find all HunterAI nodes in the scene or a specific group
	# Hunters must be in the "hunters" group and have a 'register_with_savant' method.
	get_tree().call_group("hunters", "register_with_savant", self)

func register_hunter(hunter_node: Node) -> void:
	if hunter_node and not _registered_hunters.has(hunter_node):
		_registered_hunters.append(hunter_node)
		# Connect the signal to the hunter's _on_insight_received method
		if hunter_node.has_method("_on_insight_received"):
			insight_distributed.connect(hunter_node._on_insight_received)

func unregister_hunter(hunter_node: Node) -> void:
	if hunter_node and _registered_hunters.has(hunter_node):
		if hunter_node.has_method("_on_insight_received"):
			insight_distributed.disconnect(hunter_node._on_insight_received)
		_registered_hunters.erase(hunter_node)

func process_lost_memory(memory_fragment_id: String) -> void:
	# Convert the lost memory fragment into a behavior insight
	var insight_data: Dictionary = _memory_to_insight_map.get(memory_fragment_id, {})
	if not insight_data.is_empty():
		_distribute_insight(insight_data)
	else:
		pass # Ignore unknown fragments

func _distribute_insight(insight_data: Dictionary) -> void:
	# Broadcast the insight to all registered hunters
	insight_distributed.emit(insight_data)
