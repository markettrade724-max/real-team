class_name MnemonicReconstructionShard
extends Node3D

@export_file("*.gdshader") var shader_path: String = ""
@export var pristine_albedo_texture: Texture2D
@export var pristine_normal_texture: Texture2D
@export var decayed_albedo_texture: Texture2D
@export var decayed_normal_texture: Texture2D

@export var reversal_duration: float = 1.0 # Time to transition from decayed to pristine
@export var restored_state_duration: float = 5.0 # How long it stays pristine
@export var re_decay_duration: float = 2.0 # Time to transition from pristine back to decayed

@export var pristine_collision_shape: Shape3D # e.g., BoxShape3D
@export var decayed_collision_shape: Shape3D # e.g., ConcavePolygonShape3D

var _mesh_instance: MeshInstance3D
var _collision_shape_node: CollisionShape3D
var _shader_material: ShaderMaterial
var _current_reversal_factor: float = 0.0:
	set(value):
		_current_reversal_factor = clampf(value, 0.0, 1.0)
		if _shader_material:
			_shader_material.set_shader_parameter("reversal_factor", _current_reversal_factor)
		_update_physical_state(_current_reversal_factor)

var _reversal_tween: Tween
var _restored_timer: Timer

enum State {
	DECAYED,
	REVERSING,
	RESTORED,
	RE_DECAYING
}
var _current_state: State = State.DECAYED

func _ready() -> void:
	_mesh_instance = find_child("MeshInstance3D")
	_collision_shape_node = find_child("CollisionShape3D")

	if not _mesh_instance or not _collision_shape_node:
		push_error("MnemonicReconstructionShard requires a MeshInstance3D and CollisionShape3D child.")
		set_process(false)
		return

	_setup_shader_material()
	_setup_restored_timer()
	
	# Ensure initial state is decayed
	_current_reversal_factor = 0.0
	_collision_shape_node.shape = decayed_collision_shape

func _setup_shader_material() -> void:
	if not shader_path.is_empty():
		var shader_resource = load(shader_path)
		if shader_resource is Shader:
			_shader_material = ShaderMaterial.new()
			_shader_material.shader = shader_resource
			_mesh_instance.material_override = _shader_material
			
			_shader_material.set_shader_parameter("pristine_albedo", pristine_albedo_texture)
			_shader_material.set_shader_parameter("pristine_normal", pristine_normal_texture)
			_shader_material.set_shader_parameter("decayed_albedo", decayed_albedo_texture)
			_shader_material.set_shader_parameter("decayed_normal", decayed_normal_texture)
			_shader_material.set_shader_parameter("reversal_factor", _current_reversal_factor)
		else:
			push_error("Failed to load shader from path: %s" % shader_path)
	else:
		push_error("Shader path is not set for MnemonicReconstructionShard.")

func _setup_restored_timer() -> void:
	_restored_timer = Timer.new()
	add_child(_restored_timer)
	_restored_timer.one_shot = true
	_restored_timer.timeout.connect(_on_restored_timer_timeout)

func activate_reversal() -> void:
	if _current_state != State.DECAYED:
		return # Already reversing or restored

	_current_state = State.REVERSING
	_reversal_tween = create_tween()
	_reversal_tween.tween_property(self, "_current_reversal_factor", 1.0, reversal_duration)\
		.set_ease(Tween.EASE_OUT)\
		.set_trans(Tween.TRANS_SINE)
	_reversal_tween.finished.connect(_on_reversal_tween_completed)

func _on_reversal_tween_completed() -> void:
	if _current_reversal_factor >= 0.99: # Reached pristine state
		_current_state = State.RESTORED
		_restored_timer.start(restored_state_duration)
	elif _current_reversal_factor <= 0.01: # Reached decayed state
		_current_state = State.DECAYED
		_reversal_tween = null # Clean up tween reference

func _on_restored_timer_timeout() -> void:
	_current_state = State.RE_DECAYING
	_reversal_tween = create_tween()
	_reversal_tween.tween_property(self, "_current_reversal_factor", 0.0, re_decay_duration)\
		.set_ease(Tween.EASE_IN)\
		.set_trans(Tween.TRANS_SINE)
	_reversal_tween.finished.connect(_on_reversal_tween_completed)

func _update_physical_state(factor: float) -> void:
	# For simplicity, collision shapes are swapped at a threshold.
	# More complex interpolation would involve modifying shape properties directly
	# if both shapes are of the same type (e.g., BoxShape3D.extents).
	if factor > 0.5 and _collision_shape_node.shape != pristine_collision_shape:
		_collision_shape_node.shape = pristine_collision_shape
	elif factor <= 0.5 and _collision_shape_node.shape != decayed_collision_shape:
		_collision_shape_node.shape = decayed_collision_shape
