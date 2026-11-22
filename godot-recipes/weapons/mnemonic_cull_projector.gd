extends Node3D

# Signals
signal memory_culled(memory_fragment_name: String, impact_level: int)

# Exported properties
@export var memory_selection_ui_scene: PackedScene # Scene for UI selection
@export var memory_projectile_scene: PackedScene # Scene for the launched projectile
@export var cull_effect_scene: PackedScene # Scene for the full-screen visual feedback (CanvasLayer with ColorRect+ShaderMaterial)
@export var projectile_speed: float = 50.0
@export var available_memories: Array[MemoryFragmentResource] # Lyra's current memories

var current_ui_instance: Control = null
var current_cull_effect_instance: CanvasLayer = null
var is_projector_active: bool = false

func _ready() -> void:
	# Instantiate the cull effect scene once and keep it hidden
	if cull_effect_scene:
		current_cull_effect_instance = cull_effect_scene.instantiate()
		get_tree().root.add_child(current_cull_effect_instance)
		current_cull_effect_instance.visible = false
		# Ensure the shader parameter is reset
		if current_cull_effect_instance.get_child(0) is ColorRect:
			var material = current_cull_effect_instance.get_child(0).material as ShaderMaterial
			if material:
				material.set_shader_parameter("fade_amount", 0.0)

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("activate_projector") and not is_projector_active:
		activate_projector()

func activate_projector() -> void:
	if available_memories.is_empty():
		print("No memories to cull!")
		return

	is_projector_active = true
	get_tree().paused = true # Pause game for selection

	current_ui_instance = memory_selection_ui_scene.instantiate()
	add_child(current_ui_instance)
	current_ui_instance.set_memories(available_memories) # Assume UI has this method
	current_ui_instance.memory_selected.connect(_on_memory_selected)
	current_ui_instance.selection_cancelled.connect(_on_selection_cancelled)

func _on_memory_selected(memory_fragment: MemoryFragmentResource) -> void:
	if not is_instance_valid(current_ui_instance): return

	current_ui_instance.queue_free()
	current_ui_instance = null

	var index = available_memories.find(memory_fragment)
	if index != -1:
		available_memories.remove_at(index)
		memory_culled.emit(memory_fragment.fragment_name, memory_fragment.identity_impact_level)
		_apply_visual_feedback(memory_fragment.identity_impact_level)
		_create_projectile(memory_fragment)
	else:
		print("Error: Selected memory not found in available memories.")

	is_projector_active = false
	get_tree().paused = false

func _on_selection_cancelled() -> void:
	if not is_instance_valid(current_ui_instance): return

	current_ui_instance.queue_free()
	current_ui_instance = null
	is_projector_active = false
	get_tree().paused = false

func _apply_visual_feedback(impact_level: int) -> void:
	if not current_cull_effect_instance or not current_cull_effect_instance.get_child(0) is ColorRect: return

	var color_rect = current_cull_effect_instance.get_child(0) as ColorRect
	var material = color_rect.material as ShaderMaterial
	if not material: return

	current_cull_effect_instance.visible = true
	var tween = create_tween()
	tween.tween_property(material, "shader_parameter/fade_amount", 1.0, 0.2) \
		.set_ease(Tween.EASE_OUT)
	tween.tween_property(material, "shader_parameter/fade_amount", 0.0, 0.5) \
		.set_delay(0.1) \
		.set_ease(Tween.EASE_IN)
	tween.tween_callback(func(): current_cull_effect_instance.visible = false)

func _create_projectile(memory_fragment: MemoryFragmentResource) -> void:
	if not memory_projectile_scene: return

	var projectile_instance: RigidBody3D = memory_projectile_scene.instantiate()
	get_tree().current_scene.add_child(projectile_instance)
	projectile_instance.global_transform.origin = global_transform.origin # Or a muzzle point
	# Assume projectile has a method to set its visual and launch
	projectile_instance.set_visual_and_launch(
		memory_fragment.visual_representation,
		global_transform.basis.z * -projectile_speed, # Forward direction
		memory_fragment.emotional_weight
	)