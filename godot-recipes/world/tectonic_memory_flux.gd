extends CSGCombiner3D

@export var player_node_path: NodePath
@export var flux_radius: float = 20.0
@export_range(0.0, 1.0, 0.01) var erosion_threshold: float = 0.4 # Below this, chunks erode
@export_range(0.0, 1.0, 0.01) var restoration_threshold: float = 0.6 # Above this, chunks restore

var _player: Node3D
var _current_memory_integrity: float = 1.0 # 0.0 (fully eroded) to 1.0 (full memory)
var _flux_chunks: Array[CSGPrimitive3D]

signal memory_integrity_changed(new_integrity: float)

func _ready() -> void:
	if not get_parent() is CSGCombiner3D:
		push_warning("TectonicMemoryFlux script should be attached to a CSGCombiner3D node.")
		return

	_player = get_node_or_null(player_node_path)
	if not _player:
		push_error("Player node not found at path: %s" % player_node_path)
		set_process(false)
		return

	# Collect all CSGPrimitive3D children that are meant to flux
	for child in get_children():
		if child is CSGPrimitive3D:
			_flux_chunks.append(child)
			# Initialize chunks based on current integrity
			child.operation = CSGPrimitive3D.OPERATION_UNION if _current_memory_integrity >= restoration_threshold else CSGPrimitive3D.OPERATION_SUBTRACTION

	memory_integrity_changed.connect(_on_memory_integrity_changed)
	_update_flux_effect()

# Call this from Lyra's script or a MemoryManager when integrity changes
func set_memory_integrity(value: float) -> void:
	_current_memory_integrity = clampf(value, 0.0, 1.0)
	memory_integrity_changed.emit(_current_memory_integrity)
	_update_flux_effect()

# Call this when Lyra collects a memory shard
func collect_memory_shard(strength: float) -> void:
	set_memory_integrity(_current_memory_integrity + strength)

func _on_memory_integrity_changed(new_integrity: float) -> void:
	_update_flux_effect()

func _update_flux_effect() -> void:
	if not _player:
		return

	var player_pos: Vector3 = _player.global_transform.origin

	for chunk in _flux_chunks:
		var chunk_pos: Vector3 = chunk.global_transform.origin
		var distance: float = player_pos.distance_to(chunk_pos)

		if distance <= flux_radius:
			if _current_memory_integrity < erosion_threshold:
				chunk.operation = CSGPrimitive3D.OPERATION_SUBTRACTION
			elif _current_memory_integrity >= restoration_threshold:
				chunk.operation = CSGPrimitive3D.OPERATION_UNION
		# Chunks outside the radius maintain their state or revert to a default
		# For simplicity, they just stay as they are if outside radius.
