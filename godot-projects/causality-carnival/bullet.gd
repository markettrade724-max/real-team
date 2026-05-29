extends CharacterBody2D

@export var speed: float = 600.0
@export var lifetime: float = 2.0 # Seconds before bullet disappears
@export var damage: int = 10

var velocity: Vector2 = Vector2.ZERO

func _ready():
	gravity_scale = 0.0 # As per rules
	_start_lifetime_timer()

func _physics_process(delta):
	move_and_slide()

func _on_body_entered(body: Node2D):
	if body.is_in_group("enemy"):
		var enemy_node = body as Enemy # Requires Enemy script to exist
		if enemy_node:
			enemy_node.take_damage(damage)
			_destroy_bullet()
	elif body.is_in_group("player"):
		# Player bullets should not hit player
		pass
	else:
		# Hit environment or other non-player/enemy body
		_destroy_bullet()

func _start_lifetime_timer():
	await get_tree().create_timer(lifetime).timeout
	_destroy_bullet()

func _destroy_bullet():
	if is_inside_tree(): # Check if still in tree before freeing
		queue_free()
