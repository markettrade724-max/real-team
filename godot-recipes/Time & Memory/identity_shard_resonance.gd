class_name MemoryShard extends Resource

signal shard_used(shard_type: String, current_integrity_ratio: float)
signal shard_lost(shard_type: String)

enum ShardType {
	AGILITY,
	RESOLVE,
	STRENGTH
}

@export var shard_type: ShardType = ShardType.AGILITY
@export var max_integrity: int = 3
@export var decay_per_use: int = 1

var current_integrity: int:
	set(value):
		current_integrity = maxi(0, value)
		if current_integrity == 0:
			emit_signal("shard_lost", ShardType.keys()[shard_type])

func _init(p_shard_type: ShardType = ShardType.AGILITY, p_max_integrity: int = 3, p_decay_per_use: int = 1):
	shard_type = p_shard_type
	max_integrity = p_max_integrity
	decay_per_use = p_decay_per_use
	current_integrity = max_integrity

func use() -> bool:
	if current_integrity > 0:
		current_integrity -= decay_per_use
		emit_signal("shard_used", ShardType.keys()[shard_type], get_integrity_ratio())
		return true
	return false

func get_integrity_ratio() -> float:
	if max_integrity == 0:
		return 0.0
	return float(current_integrity) / max_integrity

func is_lost() -> bool:
	return current_integrity <= 0