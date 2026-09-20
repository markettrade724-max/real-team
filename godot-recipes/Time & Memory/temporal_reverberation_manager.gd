extends Node

@export var sub_viewport_container: SubViewportContainer # UI container for the memory display
@export var sub_viewport: SubViewport # Renders the memory scene
@export var lyra_node: CharacterBody3D # Lyra's main node, assumed to have a Camera3D child
@export var memory_display_rect: TextureRect # Displays sub_viewport.get_texture()
@export var memory_shader_material: ShaderMaterial # Applied to memory_display_rect

# Collision Layers (configure these in Project Settings -> Physics 3D)
const LAYER_PRESENT_WORLD = 1
const LAYER_PRESENT_ENTITY = 2
const LAYER_PAST_PHYSICAL = 4
const LAYER_PAST_GHOST = 8

var _memory_scene_instance: Node3D = null
var _reverberation_active: bool = false
var _reverberation_timer: Timer = null

func _ready() -> void:
	_reverberation_timer = Timer.new()
	add_child(_reverberation_timer)
	_reverberation_timer.timeout.connect(_on_reverberation_timer_timeout)
	sub_viewport_container.visible = false
	if memory_display_rect:
		memory_display_rect.material = memory_shader_material
		memory_display_rect.texture = sub_viewport.get_texture()

func _process(delta: float) -> void:
	if _reverberation_active and memory_shader_material:
		# Update shader time parameter for animation
		memory_shader_material.set_shader_parameter("time_param", Time.get_ticks_msec() / 1000.0)

	if _reverberation_active and lyra_node and sub_viewport.get_camera_3d():
		# Continuously sync memory camera with Lyra's camera
		var lyra_camera: Camera3D = lyra_node.find_child("Camera3D")
		if lyra_camera:
			sub_viewport.get_camera_3d().global_transform = lyra_camera.global_transform

func start_reverberation(memory_scene_path: String, duration: float) -> void:
	if _reverberation_active:
		return
	_reverberation_active = true
	sub_viewport_container.visible = true
	_load_memory_scene(memory_scene_path)
	_setup_collision_interactions(true)
	_reverberation_timer.start(duration)

func _load_memory_scene(path: String) -> void:
	var memory_scene_res = load(path)
	if memory_scene_res:
		_memory_scene_instance = memory_scene_res.instantiate()
		sub_viewport.add_child(_memory_scene_instance)
		if lyra_node:
			# Place memory scene at Lyra's current position for overlay effect
			_memory_scene_instance.global_transform = lyra_node.global_transform
	else:
		push_error("Failed to load memory scene: ", path)

func _setup_collision_interactions(activate: bool) -> void:
	# Adjust Lyra's collision mask to interact with past entities
	lyra_node.set_collision_mask_value(LAYER_PAST_PHYSICAL, activate)
	lyra_node.set_collision_mask_value(LAYER_PAST_GHOST, activate) # For detection, not physical collision

	# Adjust present hunters' collision mask
	for hunter in get_tree().get_nodes_in_group("present_hunters"):
		if hunter is CollisionObject3D:
			hunter.set_collision_mask_value(LAYER_PAST_PHYSICAL, activate)

	# Adjust past physical entities' collision layers and masks
	for entity in get_tree().get_nodes_in_group("past_physical_entities"):
		if entity is CollisionObject3D:
			entity.set_collision_layer_value(LAYER_PAST_PHYSICAL, activate)
			entity.set_collision_mask_value(LAYER_PRESENT_ENTITY, activate)

	# Adjust past ghost entities' collision layers and masks (for detection)
	for entity in get_tree().get_nodes_in_group("past_ghost_entities"):
		if entity is CollisionObject3D:
			entity.set_collision_layer_value(LAYER_PAST_GHOST, activate)
			entity.set_collision_mask_value(LAYER_PRESENT_ENTITY, activate)

func _on_reverberation_timer_timeout() -> void:
	_cleanup_reverberation()

func _cleanup_reverberation() -> void:
	if _memory_scene_instance:
		_memory_scene_instance.queue_free()
		_memory_scene_instance = null
	_setup_collision_interactions(false) # Reset collision interactions
	sub_viewport_container.visible = false
	_reverberation_active = false