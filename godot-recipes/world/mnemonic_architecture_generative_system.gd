extends Node3D

signal memory_module_added(module_node: Node3D)
signal memory_module_removed(module_node: Node3D)

@export var memory_module_scenes: Dictionary = {} # { "memory_id": PackedScene }
@export var threat_module_scenes: Array[PackedScene] = []
@export var base_module_scene: PackedScene # Default module for initial structure

var _active_modules: Dictionary = {} # { "memory_id": Node3D }
var _lyra_memories: Array[String] = [] # List of recovered memory IDs
var _silence_proximity: float = 0.0 # 0.0 (far) to 1.0 (close)
var _loading_requests: Dictionary = {} # { "memory_id": ThreadedRequest }

func _ready() -> void:
	if base_module_scene:
		_add_module("base_world", base_module_scene, Vector3.ZERO)

func _process(delta: float) -> void:
	_handle_loading_requests()

func _handle_loading_requests() -> void:
	var completed_requests: Array[String] = []
	for id in _loading_requests:
		var request_status = ResourceLoader.load_threaded_get_status(_loading_requests[id])
		if request_status == ResourceLoader.THREAD_LOAD_LOADED:
			var loaded_scene = ResourceLoader.load_threaded_get(_loading_requests[id]) as PackedScene
			if loaded_scene:
				_instantiate_module(id, loaded_scene, _get_module_spawn_position(id))
			completed_requests.append(id)
		elif request_status == ResourceLoader.THREAD_LOAD_FAILED:
			push_error("Failed to load module: ", id)
			completed_requests.append(id)

	for id in completed_requests:
		_loading_requests.erase(id)

func _add_module(id: String, scene: PackedScene, position: Vector3) -> void:
	if _active_modules.has(id) or _loading_requests.has(id):
		return

	var request_id = ResourceLoader.load_threaded_request(scene.resource_path)
	_loading_requests[id] = request_id

func _instantiate_module(id: String, scene: PackedScene, position: Vector3) -> void:
	var module_instance = scene.instantiate() as Node3D
	if module_instance:
		module_instance.name = "MemoryModule_" + id
		module_instance.position = position
		add_child(module_instance)
		_active_modules[id] = module_instance
		memory_module_added.emit(module_instance)
	else:
		push_error("Failed to instantiate module: ", id)

func _remove_module(id: String) -> void:
	if _active_modules.has(id):
		var module_node = _active_modules[id]
		memory_module_removed.emit(module_node)
		module_node.queue_free()
		_active_modules.erase(id)
	elif _loading_requests.has(id):
		_loading_requests.erase(id)

func recover_memory(memory_id: String, spawn_position: Vector3) -> void:
	if not _lyra_memories.has(memory_id):
		_lyra_memories.append(memory_id)
		if memory_module_scenes.has(memory_id):
			_add_module(memory_id, memory_module_scenes[memory_id], spawn_position)
		_reconfigure_world()

func lose_memory(memory_id: String) -> void:
	if _lyra_memories.has(memory_id):
		_lyra_memories.erase(memory_id)
		_remove_module(memory_id)
		_reconfigure_world()

func update_silence_proximity(proximity: float) -> void:
	_silence_proximity = clampf(proximity, 0.0, 1.0)
	_reconfigure_world()

func _reconfigure_world() -> void:
	# Example: Threat module based on proximity
	var threat_id = "silence_threat_zone"
	if _silence_proximity > 0.7 and not _active_modules.has(threat_id) and not threat_module_scenes.is_empty():
		var threat_scene = threat_module_scenes[randi() % threat_module_scenes.size()]
		_add_module(threat_id, threat_scene, _get_module_spawn_position(threat_id))
	elif _silence_proximity <= 0.7 and _active_modules.has(threat_id):
		_remove_module(threat_id)

	# Example: Memory-specific module (e.g., a bridge)
	var bridge_id = "memory_bridge_chasm"
	if _lyra_memories.has(bridge_id) and not _active_modules.has(bridge_id):
		if memory_module_scenes.has(bridge_id):
			_add_module(bridge_id, memory_module_scenes[bridge_id], _get_module_spawn_position(bridge_id))
	elif not _lyra_memories.has(bridge_id) and _active_modules.has(bridge_id):
		_remove_module(bridge_id)

	# This is where more complex "shape grammar" logic would go,
	# dynamically arranging modules based on _lyra_memories and current layout.
	# For brevity, we use simple conditional checks.

func _get_module_spawn_position(id: String) -> Vector3:
	# Placeholder for more sophisticated placement logic.
	# In a real game, this would use Lyra's position, existing module positions,
	# and procedural rules to find a valid, meaningful placement.
	match id:
		"base_world": return Vector3.ZERO
		"silence_threat_zone": return Vector3(10, 0, 0) # Relative to base
		"memory_bridge_chasm": return Vector3(0, 0, 15) # Relative to base
		_: return Vector3(randf_range(-20, 20), 0, randf_range(-20, 20)) # Random for unknown
