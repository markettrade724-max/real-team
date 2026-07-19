extends Node

class_name VeilOfVanishing

@export var identity_gauge_max: float = 100.0
@export var offensive_cost: float = 10.0
@export var defensive_cost: float = 5.0
@export var shield_duration: float = 1.5
@export var shield_break_threshold: float = 0.5 # Shader opacity threshold for complete memory loss

var _identity_gauge: float = identity_gauge_max
var _loaded_fragment: PhysicsBody3D = null
var _is_shield_active: bool = false
var _shield_tween: Tween = null

# References to child nodes
@onready var _dissolution_animator: AnimationPlayer = $DissolutionAnimator
@onready var _dissolution_particles: GPUParticles3D = $DissolutionParticles
@onready var _shield_animator: AnimationPlayer = $ShieldAnimator

signal identity_gauge_changed(new_value: float)
signal fragment_consumed(damage_value: float, identity_type: String)
signal fragment_shielded(identity_type: String)
signal memory_lost_partial(identity_type: String)
signal memory_lost_complete(identity_type: String)

func _ready() -> void:
	_identity_gauge = identity_gauge_max
	emit_identity_gauge_changed()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("attack") and not _is_shield_active:
		_perform_offensive_action()
	elif event.is_action_pressed("defend") and not _is_shield_active:
		_perform_defensive_action()

func load_fragment(fragment: PhysicsBody3D) -> void:
	if _loaded_fragment:
		_unload_current_fragment() # Handle previous fragment if any
	_loaded_fragment = fragment
	# Optionally, parent the fragment to this node or a specific holder
	# _loaded_fragment.reparent(self) # Or a specific fragment holder Node3D

func _unload_current_fragment() -> void:
	# Logic to return fragment to inventory or destroy it if not consumed
	pass

func _perform_offensive_action() -> void:
	if not _loaded_fragment:
		return

	if _identity_gauge < offensive_cost:
		print("Not enough identity to perform offensive action!")
		return

	_identity_gauge -= offensive_cost
	emit_identity_gauge_changed()

	var fragment_script = _loaded_fragment.get_script()
	var damage_value: float = 0.0
	var identity_type: String = "unknown"

	if fragment_script and fragment_script.has_method("get_damage_value"):
		damage_value = _loaded_fragment.get_damage_value()
	if fragment_script and fragment_script.has_method("get_identity_type"):
		identity_type = _loaded_fragment.get_identity_type()

	emit_fragment_consumed(damage_value, identity_type)

	_trigger_dissolution_effect(_loaded_fragment)
	_loaded_fragment.queue_free() # Permanently remove the fragment
	_loaded_fragment = null

func _perform_defensive_action() -> void:
	if not _loaded_fragment:
		return

	if _identity_gauge < defensive_cost:
		print("Not enough identity to perform defensive action!")
		return

	_identity_gauge -= defensive_cost
	emit_identity_gauge_changed()

	var fragment_script = _loaded_fragment.get_script()
	var identity_type: String = "unknown"
	if fragment_script and fragment_script.has_method("get_identity_type"):
		identity_type = _loaded_fragment.get_identity_type()

	emit_fragment_shielded(identity_type)

	_is_shield_active = true
	_loaded_fragment.set_collision_layer_value(1, false) # Disable its original collision
	_loaded_fragment.set_collision_mask_value(1, false)

	_trigger_shield_effect(_loaded_fragment)

	_shield_tween = create_tween()
	_shield_tween.tween_interval(shield_duration)
	_shield_tween.tween_callback(Callable(self, "_end_defensive_action"))

func _trigger_dissolution_effect(fragment: PhysicsBody3D) -> void:
	if _dissolution_animator:
		_dissolution_animator.play("dissolve") # Assumes an animation named "dissolve"
	if _dissolution_particles:
		_dissolution_particles.global_transform = fragment.global_transform
		_dissolution_particles.emitting = true

	var mesh_instance: MeshInstance3D = _get_mesh_from_fragment(fragment)
	if mesh_instance and mesh_instance.get_surface_override_material_count() > 0:
		var material: ShaderMaterial = mesh_instance.get_surface_override_material(0) as ShaderMaterial
		if material and material.has_shader_parameter("dissolve_amount"):
			var dissolve_tween = create_tween()
			dissolve_tween.tween_property(material, "shader_parameter/dissolve_amount", 1.0, 0.5)
			dissolve_tween.set_trans(Tween.TRANS_QUAD)
			dissolve_tween.set_ease(Tween.EASE_OUT)

func _trigger_shield_effect(fragment: PhysicsBody3D) -> void:
	if _shield_animator:
		_shield_animator.play("manifest_shield") # Assumes an animation named "manifest_shield"

	var mesh_instance: MeshInstance3D = _get_mesh_from_fragment(fragment)
	if mesh_instance and mesh_instance.get_surface_override_material_count() > 0:
		var material: ShaderMaterial = mesh_instance.get_surface_override_material(0) as ShaderMaterial
		if material and material.has_shader_parameter("shield_opacity"):
			var shield_tween = create_tween()
			shield_tween.tween_property(material, "shader_parameter/shield_opacity", 0.0, shield_duration) # Fades to 0
			shield_tween.set_trans(Tween.TRANS_LINEAR)
			shield_tween.set_ease(Tween.EASE_IN)
			shield_tween.tween_callback(Callable(self, "_check_shield_integrity").bind(material))

func _end_defensive_action() -> void:
	_is_shield_active = false
	if _loaded_fragment:
		_loaded_fragment.set_collision_layer_value(1, true) # Re-enable original collision
		_loaded_fragment.set_collision_mask_value(1, true)
	_check_shield_integrity(null) # Check integrity, passing null if material isn't directly accessible here

func _check_shield_integrity(material: ShaderMaterial = null) -> void:
	var identity_type: String = "unknown"
	if _loaded_fragment:
		var fragment_script = _loaded_fragment.get_script()
		if fragment_script and fragment_script.has_method("get_identity_type"):
			identity_type = _loaded_fragment.get_identity_type()

	var shield_degraded_too_much: bool = false
	if material and material.has_shader_parameter("shield_opacity"):
		shield_degraded_too_much = material.get_shader_parameter("shield_opacity") <= shield_break_threshold

	if shield_degraded_too_much:
		emit_memory_lost_complete(identity_type)
		if _loaded_fragment:
			_loaded_fragment.queue_free()
			_loaded_fragment = null
	elif _loaded_fragment: # Shield expired naturally, but didn't break catastrophically
		emit_memory_lost_partial(identity_type)
		_loaded_fragment.queue_free() # Remove fragment to represent its loss
		_loaded_fragment = null

func _get_mesh_from_fragment(fragment: PhysicsBody3D) -> MeshInstance3D:
	# Helper to find a MeshInstance3D within the fragment's children.
	for child in fragment.get_children():
		if child is MeshInstance3D:
			return child
	return null

func emit_identity_gauge_changed() -> void:
	emit_signal("identity_gauge_changed", _identity_gauge)

func get_identity_gauge() -> float:
	return _identity_gauge

func set_identity_gauge(value: float) -> void:
	_identity_gauge = clampf(value, 0.0, identity_gauge_max)
	emit_identity_gauge_changed()
