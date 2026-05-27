extends CharacterBody2D

signal died

@export var speed: float = 200.0
@export var health: int = 100

var current_health: int
var target_position: Vector2
var is_moving_with_touch: bool = false

@onready var weapon: Weapon = $Weapon # Assuming Weapon is a child node

func _ready():
	add_to_group("player") # Requirement
	current_health = health
	target_position = global_position # Initialize target to current position

func _physics_process(delta):
	if is_moving_with_touch:
		var direction = (target_position - global_position).normalized()
		if global_position.distance_to(target_position) > 5: # Threshold to stop
			velocity = direction * speed
		else:
			velocity = Vector2.ZERO
			is_moving_with_touch = false
	else:
		velocity = Vector2.ZERO # Stop if no active touch movement

	move_and_slide()

func _input(event):
	# Support InputEventScreenTouch for movement and shooting
	if event is InputEventScreenTouch:
		if event.pressed:
			# If a touch starts, assume it's for movement initially
			is_moving_with_touch = true
			target_position = event.position
		else:
			# If touch ends, and it was a tap (not a drag), maybe shoot
			if global_position.distance_to(target_position) < 10: # Small distance means it was a tap
				weapon.shoot(get_global_mouse_position()) # Shoot towards mouse position or tap position
			is_moving_with_touch = false
	elif event is InputEventScreenDrag:
		# If dragging, update target position for movement
		is_moving_with_touch = true
		target_position = event.position
	# For keyboard/mouse support (optional, but good for testing)
	elif event is InputEventMouseMotion:
		if Input.is_action_pressed("fire"): # Assuming "fire" action is mapped to mouse click
			weapon.shoot(event.position)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		weapon.shoot(event.position) # Shoot on left click

	var input_direction = Vector2.ZERO
	if Input.is_action_pressed("move_right"):
		input_direction.x += 1
	if Input.is_action_pressed("move_left"):
		input_direction.x -= 1
	if Input.is_action_pressed("move_down"):
		input_direction.y += 1
	if Input.is_action_pressed("move_up"):
		input_direction.y -= 1

	if input_direction != Vector2.ZERO:
		is_moving_with_touch = false # Override touch movement if keyboard is used
		velocity = input_direction.normalized() * speed
	# If both touch and keyboard inputs are used, prioritize one or combine.
	# For simplicity, if keyboard is pressed, it takes over.

func take_damage(amount: int):
	current_health -= amount
	print("Player took damage. Health: ", current_health)
	if current_health <= 0:
		die()

func die():
	print("Player died.")
	emit_signal("died")
	# Requirement: is_inside_tree() before queue_free() after await
	# This might be for asynchronous operations, here it's direct.
	# If there was an animation or sound to play, it would be:
	# await get_node("AnimationPlayer").animation_finished
	# if is_inside_tree():
	# 	queue_free()
	# For now, direct free.
	queue_free()
