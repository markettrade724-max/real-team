@tool
class_name ChronoSpatialRemanifestation extends Node3D

signal memory_cost_incurred(amount: float)
signal silence_attracted(strength: float)
signal remanifestation_completed

@export_node_path("CollisionObject3D") var remanifested_object_path: NodePath = "" # Path to the root of the object to remanifest (e.g., StaticBody3D)
@export var remanifestation_duration: float = 3.0
@export var memory_cost_amount: float = 10.0
@export var silence_attraction_strength: float = 5.0
@export var dissolve_shader_material: ShaderMaterial # Requires 'dissolve_amount' and 'flicker_value' uniforms
@export var flicker_speed: float = 10.0 # Cycles per second for flicker effect
@export var flicker_intensity: float = 0.1 # Max alpha reduction for flicker (shader uniform)

var _remanifested_object_root: Node3D
var _original_materials: Dictionary = {}
var _dissolve_tween: Tween
var _flicker_tween: Tween
var _is_active: bool = false

func _ready() -> void:
	_setup_remanifested_object()

func _setup_remanifested_object() -> void:
	if not is_node_ready():
		await ready

	if remanifested_object_path.is_empty():
		push_error("ChronoSpatialRemanifestation: 'remanifested_object_path' is not set.")
		return

	_remanifested_object_root = get_node_or_null(remanifested_object_path)
	if not _remanifested_object_root:
		push_error("ChronoSpatialRemanifestation: Remanifested object not found at path: %s" % remanifested_object_path)
		return

	_remanifested_object_root.visible = false
	_set_collision_enabled(_remanifested_object_root, false)
	_store_original_materials(_remanifested_object_root)

func _store_original_materials(node: Node) -> void:
	if node is MeshInstance3D:
		_original_materials[node] = node.get_active_material(0)
	for child in node.get_children():
		_store_original_materials(child)

func _set_collision_enabled(node: Node, enable: bool) -> void:
	if node is CollisionObject3D:
		# Assuming collision layer 1 is for the player/world interaction
		node.set_collision_mask_value(1, enable)
		node.set_collision_layer_value(1, enable)
	for child in node.get_children():
		_set_collision_enabled(child, enable)

func activate_remanifestation() -> void:
	if _is_active or not _remanifested_object_root:
		return

	if not dissolve_shader_material:
		push_error("ChronoSpatialRemanifestation: 'dissolve_shader_material' is not set.")
		return

	_is_active = true
	memory_cost_incurred.emit(memory_cost_amount)
	silence_attracted.emit(silence_attraction_strength)

	_remanifested_object_root.visible = true
	_set_collision_enabled(_remanifested_object_root, true)

	_apply_shader_recursively(_remanifested_object_root, dissolve_shader_material)
	dissolve_shader_material.set_shader_parameter("dissolve_amount", 0.0)
	dissolve_shader_material.set_shader_parameter("flicker_value", 0.0)

	_dissolve_tween = create_tween()
	_dissolve_tween.tween_property(dissolve_shader_material, "shader_parameter/dissolve_amount", 1.0, remanifestation_duration)
	_dissolve_tween.set_trans(Tween.TRANS_LINEAR)
	_dissolve_tween.set_ease(Tween.EASE_IN)
	_dissolve_tween.finished.connect(_on_dissolve_finished)

	_flicker_tween = create_tween()
	_flicker_tween.set_loops() # Loop indefinitely until dissolve finishes
	_flicker_tween.tween_property(dissolve_shader_material, "shader_parameter/flicker_value", 1.0, 1.0 / flicker_speed)
	_flicker_tween.tween_property(dissolve_shader_material, "shader_parameter/flicker_value", 0.0, 1.0 / flicker_speed)
	_flicker_tween.set_trans(Tween.TRANS_SINE)
	_flicker_tween.set_ease(Tween.EASE_IN_OUT)

func _apply_shader_recursively(node: Node, material: Material) -> void:
	if node is MeshInstance3D:
		node.set_surface_override_material(0, material)
	for child in node.get_children():
		_apply_shader_recursively(child, material)

func _restore_original_materials_recursively(node: Node) -> void:
	if node is MeshInstance3D and _original_materials.has(node):
		node.set_surface_override_material(0, _original_materials[node])
	for child in node.get_children():
		_restore_original_materials_recursively(child)

func _on_dissolve_finished() -> void:
	if _flicker_tween and _flicker_tween.is_running():
		_flicker_tween.stop()
		_flicker_tween = null

	_remanifested_object_root.visible = false
	_set_collision_enabled(_remanifested_object_root, false)
	_restore_original_materials_recursively(_remanifested_object_root)

	_is_active = false
	remanifestation_completed.emit()
