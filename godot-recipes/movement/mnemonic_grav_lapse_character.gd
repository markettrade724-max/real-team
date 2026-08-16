extends CharacterBody3D

@export var move_speed: float = 7.0
@export var jump_velocity: float = 10.0
@export var default_gravity: Vector3 = Vector3(0, -9.8, 0) # Global default gravity

var current_gravity_vector: Vector3 = default_gravity
var active_grav_zones: Array[Area3D] = [] # Keep track of all zones Lyra is currently in

func _ready():
	# Ensure the character starts with default gravity
	current_gravity_vector = default_gravity

func _physics_process(delta: float):
	# Apply current gravity
	velocity += current_gravity_vector * delta

	# Handle jump (relative to current 'down' direction)
	if Input.is_action_just_pressed("jump") and is_on_floor():
		# Jump opposite to the current gravity direction
		velocity = -current_gravity_vector.normalized() * jump_velocity

	# Get input direction
	var input_dir: Vector3 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	# Project movement onto the plane perpendicular to current gravity
	var gravity_normal: Vector3 = current_gravity_vector.normalized()
	var projected_direction: Vector3 = direction - gravity_normal * direction.dot(gravity_normal)
	projected_direction = projected_direction.normalized()

	# Apply movement
	if projected_direction != Vector3.ZERO:
		velocity.x = projected_direction.x * move_speed
		velocity.z = projected_direction.z * move_speed
	else:
		velocity.x = move_toward(velocity.x, 0, move_speed)
		velocity.z = move_toward(velocity.z, 0, move_speed)

	move_and_slide()

# Called by GravLapseZone when Lyra enters
func _on_grav_zone_entered(zone: Area3D, custom_grav: Vector3):
	if not active_grav_zones.has(zone):
		active_grav_zones.append(zone)
	_update_current_gravity()

# Called by GravLapseZone when Lyra exits
func _on_grav_zone_exited(zone: Area3D):
	if active_grav_zones.has(zone):
		active_grav_zones.erase(zone)
	_update_current_gravity()

func _update_current_gravity():
	if active_grav_zones.is_empty():
		current_gravity_vector = default_gravity
	else:
		# For simplicity, use the gravity of the first active zone found.
		# A more complex system might average, blend, or prioritize.
		var first_active_zone: Area3D = active_grav_zones[0]
		if first_active_zone and first_active_zone.has_method("get_zone_gravity"):
			current_gravity_vector = first_active_zone.get_zone_gravity()
		else:
			current_gravity_vector = default_gravity # Fallback


# --- grav_lapse_zone.gd (Dependency) ---
# extends Area3D
#
# @export var custom_gravity_vector: Vector3 = Vector3(0, 9.8, 0) # Example: upwards gravity
# @export var zone_priority: int = 0 # Higher priority zones override lower ones (not used in this simple recipe)
#
# func _ready():
#	body_entered.connect(_on_body_entered)
#	body_exited.connect(_on_body_exited)
#
# func _on_body_entered(body: Node3D):
#	if body is CharacterBody3D and body.has_method("_on_grav_zone_entered"):
#		body._on_grav_zone_entered(self, custom_gravity_vector)
#
# func _on_body_exited(body: Node3D):
#	if body is CharacterBody3D and body.has_method("_on_grav_zone_exited"):
#		body._on_grav_zone_exited(self)
#
# func get_zone_gravity() -> Vector3:
#	return custom_gravity_vector
#
# func get_zone_priority() -> int:
#	return zone_priority
