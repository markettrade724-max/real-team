@tool
extends Area3D

## Emitted when the fragment is activated, signaling global erosion.
signal fragment_activated(erosion_amount: float)

@export_group("Distortion Settings")
@export var distortion_factor: float = 0.5: # Time scale factor (e.g., 0.5 for slow-mo, 2.0 for fast-mo)
	set(value):
		distortion_factor = value
		if Engine.is_editor_hint():
			_update_visual_material()
@export var distortion_duration: float = 3.0 # How long the localized distortion lasts
@export var erosion_amount: float = 0.1 # Amount to increase global erosion on activation

@export_group("Visuals")
@export var visual_mesh: MeshInstance3D # Child MeshInstance3D to visualize the distortion zone
@export var distortion_shader_material: ShaderMaterial # ShaderMaterial for the visual_mesh

var _is_activated: bool = false
var _distortion_timer: Timer

func _ready() -> void:
	# Connect signals for bodies entering/exiting this Area3D
	body_entered.connect(_on_body_entered_zone)
	body_exited.connect(_on_body_exited_zone)
	# Ensure the visual mesh has the correct material in editor
	if Engine.is_editor_hint():
		_update_visual_material()

func _on_body_entered_zone(body: Node3D) -> void:
	if _is_activated:
		# If already active, apply distortion to new entrants
		if body is DistortableEntity:
			(body as DistortableEntity).apply_time_distortion(distortion_factor)
	else:
		# If not active, this is the trigger for activation (e.g., player entering)
		if body.is_in_group("player"): # Assuming player is in "player" group
			_activate_fragment()

func _on_body_exited_zone(body: Node3D) -> void:
	if _is_activated:
		# Remove distortion when bodies leave the active zone
		if body is DistortableEntity:
			(body as DistortableEntity).remove_time_distortion()

func _activate_fragment() -> void:
	if _is_activated:
		return

	_is_activated = true
	set_monitoring(true) # Ensure Area3D monitors bodies

	# Notify global erosion manager (assuming it's an autoload named 'TemporalErosionManager')
	if Engine.has_singleton("TemporalErosionManager"):
		TemporalErosionManager.increase_erosion(erosion_amount)
	else:
		push_warning("TemporalErosionManager autoload not found. Global erosion will not be applied.")

	# Apply visual distortion
	if visual_mesh and distortion_shader_material:
		visual_mesh.material_override = distortion_shader_material
		# Pass parameters to shader if needed (e.g., distortion_strength)
		if distortion_shader_material.has_param("distortion_strength"):
			distortion_shader_material.set_shader_parameter("distortion_strength", distortion_factor)

	# Apply distortion to all currently overlapping bodies
	for body in get_overlapping_bodies():
		if body is DistortableEntity:
			(body as DistortableEntity).apply_time_distortion(distortion_factor)

	# Start timer to end distortion
	_distortion_timer = Timer.new()
	add_child(_distortion_timer)
	_distortion_timer.wait_time = distortion_duration
	_distortion_timer.one_shot = true
	_distortion_timer.timeout.connect(_on_distortion_timer_timeout)
	_distortion_timer.start()

func _on_distortion_timer_timeout() -> void:
	_is_activated = false

	# Remove visual distortion
	if visual_mesh:
		visual_mesh.material_override = null

	# Remove distortion from all currently overlapping bodies
	for body in get_overlapping_bodies():
		if body is DistortableEntity:
			(body as DistortableEntity).remove_time_distortion()

	# Make fragment non-interactable after use and remove itself
	set_monitoring(false)
	set_collision_mask_value(1, false) # Example: disable collision for player interaction
	set_collision_layer_value(1, false) # Example: disable collision for other bodies
	_distortion_timer.queue_free()
	queue_free() # Fragment is consumed

func _update_visual_material() -> void:
	if visual_mesh and distortion_shader_material:
		visual_mesh.material_override = distortion_shader_material
		if distortion_shader_material.has_param("distortion_strength"):
			distortion_shader_material.set_shader_parameter("distortion_strength", distortion_factor)
