@tool
extends Area3D

class OriginalState:
	var original_material: Material
	var original_collision_disabled: bool
	var mesh_instance: MeshInstance3D
	var collision_shape: CollisionShape3D
	var tear_shader_material: ShaderMaterial
	var time_in_zone: float = 0.0
	var is_collision_active: bool = true # Tracks current collision state (true = enabled, false = disabled)

# Path to the Chrono-Tear shader resource
@export_file("*.gdshader") var tear_shader_path: String = "res://shaders/mnemonic_chrono_tear.gdshader"
# Time in seconds between collision state changes (on/off)
@export var flicker_interval: float = 0.1
# Overall intensity of the visual tear effect (0.0-1.0)
@export var tear_intensity: float = 0.7
# Speed of the internal noise animation in the shader
@export var tear_speed: float = 5.0
# Noise texture used by the shader for displacement and alpha clipping
@export var noise_texture: NoiseTexture

var _affected_objects: Dictionary = {} # Stores OriginalState for each affected body
var _tear_shader_resource: Shader # Loaded shader resource

func _ready():
	# Load the shader resource once
	if tear_shader_path and not tear_shader_path.is_empty():
		_tear_shader_resource = load(tear_shader_path)
		if not _tear_shader_resource:
			push_error("Failed to load Chrono-Tear shader from path: %s" % tear_shader_path)
	else:
		push_error("Chrono-Tear shader path is not set.")

	# Connect signals for detecting bodies entering and exiting the area
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _process(delta: float):
	# Iterate through all affected objects and update their tear state
	for body in _affected_objects.keys():
		var state: OriginalState = _affected_objects[body]
		state.time_in_zone += delta

		# Calculate a pulsating tear factor for visual effect
		var current_visual_tear_factor: float = sin(state.time_in_zone * tear_speed * 2.0) * 0.5 + 0.5
		state.tear_shader_material.set_shader_parameter("tear_factor", current_visual_tear_factor * tear_intensity)
		state.tear_shader_material.set_shader_parameter("time_offset", state.time_in_zone) # Pass time for shader animation

		# Toggle collision shape disabled state based on flicker_interval
		var should_be_active: bool = fmod(state.time_in_zone, flicker_interval * 2.0) < flicker_interval
		if state.is_collision_active != should_be_active:
			state.collision_shape.disabled = !should_be_active
			state.is_collision_active = should_be_active

func _on_body_entered(body: Node3D):
	var mesh_instance: MeshInstance3D = null
	var collision_shape: CollisionShape3D = null

	# Check if the body itself is a MeshInstance3D or CollisionShape3D
	if body is MeshInstance3D:
		mesh_instance = body
	if body is CollisionShape3D:
		collision_shape = body

	# If not found directly, search among immediate children
	if not mesh_instance or not collision_shape:
		for child in body.get_children():
			if not mesh_instance and child is MeshInstance3D:
				mesh_instance = child
			if not collision_shape and child is CollisionShape3D:
				collision_shape = child
			if mesh_instance and collision_shape:
				break # Found both, no need to continue searching

	if not mesh_instance or not collision_shape or not _tear_shader_resource:
		return # Not a valid target for Chrono-Tear effect

	if _affected_objects.has(body):
		return # Already affecting this body

	var state = OriginalState.new()
	state.mesh_instance = mesh_instance
	state.collision_shape = collision_shape

	# Store original material
	state.original_material = mesh_instance.get_surface_override_material(0) if mesh_instance.get_surface_override_material(0) else mesh_instance.material_override
	if not state.original_material and mesh_instance.mesh:
		state.original_material = mesh_instance.mesh.surface_get_material(0)

	# Store original collision state
	state.original_collision_disabled = collision_shape.disabled

	# Create and apply new shader material instance
	state.tear_shader_material = ShaderMaterial.new()
	state.tear_shader_material.shader = _tear_shader_resource
	if noise_texture:
		state.tear_shader_material.set_shader_parameter("noise_texture", noise_texture)
	else:
		push_warning("Noise texture not set for Chrono-Tear effect on %s." % body.name)

	# Try to copy existing albedo texture and color if available
	if state.original_material is StandardMaterial3D:
		var std_mat: StandardMaterial3D = state.original_material
		state.tear_shader_material.set_shader_parameter("albedo", std_mat.albedo_color)
		if std_mat.albedo_texture:
			state.tear_shader_material.set_shader_parameter("texture_albedo", std_mat.albedo_texture)
	elif state.original_material is ShaderMaterial: # If already a shader material, try to extract albedo
		var existing_shader_mat: ShaderMaterial = state.original_material
		if existing_shader_mat.has_shader_parameter("albedo"):
			state.tear_shader_material.set_shader_parameter("albedo", existing_shader_mat.get_shader_parameter("albedo"))
		if existing_shader_mat.has_shader_parameter("texture_albedo"):
			state.tear_shader_material.set_shader_parameter("texture_albedo", existing_shader_mat.get_shader_parameter("texture_albedo"))
	else: # Default albedo if no specific material
		state.tear_shader_material.set_shader_parameter("albedo", Color(1, 1, 1, 1))

	mesh_instance.material_override = state.tear_shader_material
	_affected_objects[body] = state

func _on_body_exited(body: Node3D):
	if _affected_objects.has(body):
		var state: OriginalState = _affected_objects[body]
		# Restore original material
		if is_instance_valid(state.mesh_instance):
			state.mesh_instance.material_override = state.original_material
		# Restore original collision state
		if is_instance_valid(state.collision_shape):
			state.collision_shape.disabled = state.original_collision_disabled
		_affected_objects.erase(body)

func _exit_tree():
	# Clean up any lingering effects when the node is removed
	for body in _affected_objects.keys():
		var state: OriginalState = _affected_objects[body]
		if is_instance_valid(state.mesh_instance):
			state.mesh_instance.material_override = state.original_material
		if is_instance_valid(state.collision_shape):
			state.collision_shape.disabled = state.original_collision_disabled
	_affected_objects.clear()
