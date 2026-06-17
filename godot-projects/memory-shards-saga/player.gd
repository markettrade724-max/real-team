extends CharacterBody3D

@export var speed: float = 5.0
@export var jump_velocity: float = 4.5
@export var mouse_sensitivity: float = 0.002

@export var max_health: int = 100
var current_health: int

# Get the gravity from the project settings to be synced with RigidBody nodes.
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

@onready var camera_pivot: Node3D = $CameraPivot # Assumes a Node3D named CameraPivot for vertical camera rotation
@onready var camera: Camera3D = $CameraPivot/Camera3D # Assumes Camera3D is a child of CameraPivot
@onready var weapon: Node3D = $Weapon # Assumes a Weapon node with a shoot() method

signal player_died

func _ready() -> void:
	add_to_group("player")
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)
	current_health = max_health

func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
	    # Rotate the player (yaw) for horizontal mouse movement
	    rotate_y(-event.relative.x * mouse_sensitivity)
	    # Rotate the camera pivot (pitch) for vertical mouse movement
	    camera_pivot.rotate_x(-event.relative.y * mouse_sensitivity)
	    # Clamp the camera's vertical rotation to prevent flipping
	    camera_pivot.rotation.x = clamp(camera_pivot.rotation.x, deg_to_rad(-90), deg_to_rad(90))

	if event.is_action_just_pressed("fire"):
	    if weapon and weapon.has_method("shoot"):
	        weapon.shoot() # Calls the shoot method on the weapon node

func _physics_process(delta: float) -> void:
	# Apply gravity if not on the floor
	var velocity: Vector3 = linear_velocity
	if not is_on_floor():
	    velocity.y -= gravity * delta

	# Handle Jump input
	if Input.is_action_just_pressed("jump") and is_on_floor():
	    velocity.y = jump_velocity

	# Get the input direction for WASD movement
	var input_dir: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var direction: Vector3 = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	# Apply movement or decelerate if no input
	if direction:
	    velocity.x = direction.x * speed
	    velocity.z = direction.z * speed
	else:
	    velocity.x = move_toward(velocity.x, 0, speed)
	    velocity.z = move_toward(velocity.z, 0, speed)

	linear_velocity = velocity
	move_and_slide()

func take_damage(amount: int) -> void:
	if current_health <= 0:
	    return # Already dead, prevent further damage processing

	current_health -= amount
	print("Player took %d damage. Current health: %d" % [amount, current_health])

	if current_health <= 0:
	    current_health = 0
	    die()

func die() -> void:
	print("Player died!")
	emit_signal("player_died")

	# As per the rule: 'is_inside_tree() before any queue_free() after await'
	# This example waits for a short duration (e.g., for a death animation/sound to play)
	# before freeing the player node from the scene tree.
	await get_tree().create_timer(0.5).timeout # Wait for 0.5 seconds
	if is_inside_tree(): # Check if the node is still in the scene tree before freeing
	    queue_free()
