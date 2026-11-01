@tool
extends Node

class_name MnemonicEntanglementMomentum

@export var player_body_path: NodePath
@export var player_mesh_path: NodePath
@export var effect_duration: float = 3.0
@export var default_shader_material: ShaderMaterial # Assign a ShaderMaterial resource using mnemonic_entanglement_momentum.gdshader

var _player_body: CharacterBody3D
var _player_mesh: MeshInstance3D
var _effect_timer: Timer

var _original_gravity_scale: float
var _original_shader_material: ShaderMaterial

# These parameters are primarily for RigidBody3D. For CharacterBody3D (kinematic),
# setting them via PhysicsServer3D.body_set_param might not directly affect movement
# without custom _physics_process logic that interprets these values.
var _original_mass: float
var _original_linear_damping: float
var _original_angular_damping: float

func _ready() -> void:
	if Engine.is_editor_hint():
		return

	_player_body = get_node_or_null(player_body_path) as CharacterBody3D
	_player_mesh = get_node_or_null(player_mesh_path) as MeshInstance3D

	if not _player_body:
		push_error("MnemonicEntanglementMomentum: Player CharacterBody3D not found at path: ", player_body_path)
		set_process(false)
		return
	if not _player_mesh:
		push_error("MnemonicEntanglementMomentum: Player MeshInstance3D not found at path: ", player_mesh_path)
		set_process(false)
		return
	if not default_shader_material:
		push_error("MnemonicEntanglementMomentum: 'default_shader_material' is not assigned. Please assign a ShaderMaterial resource.")
		set_process(false)
		return

	_effect_timer = Timer.new()
	add_child(_effect_timer)
	_effect_timer.wait_time = effect_duration
	_effect_timer.one_shot = true
	_effect_timer.timeout.connect(_on_effect_timer_timeout)

	_store_original_physics_state()
	_store_original_shader_state()

func _store_original_physics_state() -> void:
	_original_gravity_scale = _player_body.gravity_scale
	# Store current PhysicsServer3D parameters for CharacterBody3D's RID
	_original_mass = PhysicsServer3D.body_get_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_MASS)
	_original_linear_damping = PhysicsServer3D.body_get_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_LINEAR_DAMPING)
	_original_angular_damping = PhysicsServer3D.body_get_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_ANGULAR_DAMPING)

func _store_original_shader_state() -> void:
	# Prioritize material_override, then surface_override, then mesh material
	if _player_mesh.material_override:
		_original_shader_material = _player_mesh.material_override as ShaderMaterial
	elif _player_mesh.get_surface_override_material(0):
		_original_shader_material = _player_mesh.get_surface_override_material(0) as ShaderMaterial
	elif _player_mesh.mesh and _player_mesh.mesh.surface_get_material(0):
		_original_shader_material = _player_mesh.mesh.surface_get_material(0) as ShaderMaterial
	else:
		_original_shader_material = null # No original material to restore, will clear override

func absorb_memory_shard(shard_data: Dictionary) -> void:
	if not _player_body or not _player_mesh or not default_shader_material:
		push_error("MnemonicEntanglementMomentum: Component not initialized or default_shader_material missing.")
		return

	var semantic_weight: String = shard_data.get("semantic_weight", "neutral")
	var effect_params: Dictionary = _calculate_physics_effect(semantic_weight)

	_apply_physics_effect(effect_params)
	_apply_shader_effect(semantic_weight)

	_effect_timer.start()

func _calculate_physics_effect(semantic_weight: String) -> Dictionary:
	var params: Dictionary = {
		"gravity_scale": _original_gravity_scale,
		"mass": _original_mass,
		"linear_damping": _original_linear_damping,
		"angular_damping": _original_angular_damping
	}

	match semantic_weight:
		"burden": # Heavy, slow
			params.gravity_scale *= 2.5
			params.mass *= 2.0
			params.linear_damping = max(params.linear_damping, 0.5) + 1.0 # Ensure some damping
		"freedom": # Light, agile
			params.gravity_scale *= 0.3
			params.mass *= 0.5
			params.linear_damping = max(params.linear_damping, 0.1) * 0.5 # Reduce damping
		"chaos": # Unpredictable
			params.gravity_scale *= randf_range(0.1, 3.0)
			params.mass *= randf_range(0.5, 2.0)
			params.linear_damping = randf_range(0.1, 2.0)
			params.angular_damping = randf_range(0.1, 2.0)
		_: # "neutral" or unknown
			pass # No change from original

	return params

func _apply_physics_effect(effect_params: Dictionary) -> void:
	# Apply gravity_scale directly to CharacterBody3D property (also affects PhysicsServer3D)
	_player_body.gravity_scale = effect_params.gravity_scale

	# Apply other parameters via PhysicsServer3D.body_set_param to the CharacterBody3D's RID.
	# Note: For CharacterBody3D (kinematic), mass and damping parameters set this way
	# do not directly influence its kinematic movement without custom _physics_process
	# logic that explicitly reads and applies these values.
	PhysicsServer3D.body_set_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_MASS, effect_params.mass)
	PhysicsServer3D.body_set_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_LINEAR_DAMPING, effect_params.linear_damping)
	PhysicsServer3D.body_set_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_ANGULAR_DAMPING, effect_params.angular_damping)

func _apply_shader_effect(effect_type: String) -> void:
	var new_shader_material = default_shader_material.duplicate() as ShaderMaterial
	var effect_color: Color = Color.WHITE
	var effect_strength: float = 0.0

	match effect_type:
		"burden":
			effect_color = Color("6b0000") # Dark red, heavy
			effect_strength = 0.8
		"freedom":
			effect_color = Color("006b6b") # Light blue/cyan, airy
			effect_strength = 0.6
		"chaos":
			effect_color = Color("6b6b00") # Yellow/green, unstable
			effect_strength = 1.0
		_: # "neutral" or unknown
			effect_color = Color.WHITE
			effect_strength = 0.0

	new_shader_material.set_shader_parameter("effect_color", effect_color)
	new_shader_material.set_shader_parameter("effect_strength", effect_strength)

	_player_mesh.material_override = new_shader_material

func _on_effect_timer_timeout() -> void:
	_restore_original_physics()
	_restore_original_shader()

func _restore_original_physics() -> void:
	_player_body.gravity_scale = _original_gravity_scale
	PhysicsServer3D.body_set_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_MASS, _original_mass)
	PhysicsServer3D.body_set_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_LINEAR_DAMPING, _original_linear_damping)
	PhysicsServer3D.body_set_param(_player_body.get_rid(), PhysicsServer3D.BODY_PARAM_ANGULAR_DAMPING, _original_angular_damping)

func _restore_original_shader() -> void:
	_player_mesh.material_override = _original_shader_material
