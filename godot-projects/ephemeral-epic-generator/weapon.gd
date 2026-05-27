extends Node2D

@export var bullet_scene: PackedScene
@export var fire_rate: float = 0.2 # Seconds between shots

var can_shoot: bool = true

func _ready():
	if not bullet_scene:
		push_error("Bullet scene not assigned to Weapon.")

func shoot(target_position: Vector2):
	if not can_shoot or not bullet_scene:
		return

	can_shoot = false
	var bullet_instance = bullet_scene.instantiate()
	get_tree().current_scene.add_child(bullet_instance) # Add bullet to main scene
	bullet_instance.global_position = global_position # Bullet starts at weapon's global position

	var direction = (target_position - global_position).normalized()
	bullet_instance.set_direction(direction) # Set bullet's direction

	# Cooldown timer
	var timer = get_tree().create_timer(fire_rate)
	timer.timeout.connect(func(): can_shoot = true)
