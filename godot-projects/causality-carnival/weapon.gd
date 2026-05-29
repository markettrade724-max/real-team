extends Node2D

@export var bullet_scene: PackedScene
@export var fire_rate: float = 0.5 # Seconds between shots
@export var bullet_speed: float = 500.0
@export var damage: int = 10

var can_fire: bool = true

func _ready():
	pass

func fire(shooter_global_position: Vector2, target_global_position: Vector2):
	if not can_fire:
		return

	can_fire = false
	var bullet = bullet_scene.instantiate()
	# Add bullet to the main scene's root (or a designated bullet layer)
	get_tree().current_scene.add_child(bullet)

	bullet.global_position = shooter_global_position # Position bullet at weapon's global position
	bullet.damage = damage

	var direction = (target_global_position - shooter_global_position).normalized()
	bullet.velocity = direction * bullet_speed
	
	# Rotate weapon towards target for visual feedback (optional)
	look_at(target_global_position)

	_start_cooldown()

func _start_cooldown():
	await get_tree().create_timer(fire_rate).timeout
	can_fire = true
