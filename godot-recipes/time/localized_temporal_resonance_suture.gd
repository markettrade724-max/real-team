extends Area3D

signal memory_sutured(memory_fragment_id: String)

@export_file("*.tscn") var memory_pocket_scene_path: String = "":
	set(value):
		memory_pocket_scene_path = value
		_load_memory_pocket_scene()

@export var initial_pocket_time_scale: float = 0.2 # How slow/fast the memory pocket starts
@export var suture_duration: float = 1.0 # Time to synchronize the pocket
@export var memory_fragment_id: String = "unidentified_fragment" # Identifier for the recovered memory

var _memory_pocket_root: Node3D
var _current_suture_tween: Tween

@onready var _sub_viewport_container: SubViewportContainer = $"SubViewportContainer"
@onready var _sub_viewport: SubViewport = $"SubViewportContainer/SubViewport"

func _ready() -> void:
	_configure_sub_viewport()
	_load_memory_pocket_scene()

	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _configure_sub_viewport() -> void:
	_sub_viewport.usage = SubViewport.USAGE_3D
	_sub_viewport.transparent_bg = true
	_sub_viewport.size = _sub_viewport_container.size

func _load_memory_pocket_scene() -> void:
	# Clear existing pocket if any
	if _memory_pocket_root:
		_memory_pocket_root.queue_free()
		_memory_pocket_root = null

	if not memory_pocket_scene_path.is_empty():
		var pocket_scene: PackedScene = load(memory_pocket_scene_path)
		if pocket_scene:
			_memory_pocket_root = pocket_scene.instantiate()
			_sub_viewport.add_child(_memory_pocket_root)
			_set_pocket_time_scale(initial_pocket_time_scale)
		else:
			push_error("Failed to load memory pocket scene: %s" % memory_pocket_scene_path)

func _set_pocket_time_scale(value: float) -> void:
	if _memory_pocket_root and _memory_pocket_root.has_method("set_pocket_time_scale"):
		_memory_pocket_root.set_pocket_time_scale(value)
	else:
		push_warning("Memory pocket root does not have 'set_pocket_time_scale' method. Time scale not applied.")

func _get_pocket_time_scale() -> float:
	if _memory_pocket_root and _memory_pocket_root.has_method("get_pocket_time_scale"):
		return _memory_pocket_root.get_pocket_time_scale()
	return initial_pocket_time_scale # Default if method not found

func _on_body_entered(body: Node3D) -> void:
	# Replace with actual player detection logic (e.g., check group, specific component)
	if body.is_in_group("player_character"): 
		_start_suture_process()

func _on_body_exited(body: Node3D) -> void:
	if body.is_in_group("player_character"): 
		_cancel_suture_process()

func _start_suture_process() -> void:
	if _current_suture_tween and _current_suture_tween.is_running():
		return

	if not _memory_pocket_root or not _memory_pocket_root.has_method("set_pocket_time_scale"):
		return

	_current_suture_tween = create_tween()
	_current_suture_tween.tween_method(
		_set_pocket_time_scale,
		_get_pocket_time_scale(),
		1.0, # Target time scale (normal speed)
		suture_duration
	).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_current_suture_tween.finished.connect(_on_suture_finished)

func _cancel_suture_process() -> void:
	if _current_suture_tween and _current_suture_tween.is_running():
		_current_suture_tween.kill()
	_set_pocket_time_scale(initial_pocket_time_scale) # Revert to initial state

func _on_suture_finished() -> void:
	emit_signal("memory_sutured", memory_fragment_id)
	# Memory fragment is recovered, this area can now be removed or disabled
	queue_free() # Example: remove the suture area after recovery
