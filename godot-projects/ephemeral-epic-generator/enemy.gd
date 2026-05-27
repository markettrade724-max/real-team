extends CharacterBody2D

signal died

@export var speed: float = 100.0
@export var health: int = 50
@export var damage_amount: int = 10

var current_health: int

func _ready():
	add_to_group("enemy") # Add to group for easy management in MainScene
	current_health = health

func _physics_process(delta):
	var player = get_tree().get_first_node_in_group("player")
	if player:
		var direction = (player.global_position - global_position).normalized()
		velocity = direction * speed
	else:
		velocity = Vector2.ZERO # Stop if no player found

	move_and_slide()

func take_damage(amount: int):
	current_health -= amount
	print("Enemy took damage. Health: ", current_health)
	if current_health <= 0:
		die()

func die():
	print("Enemy died.")
	emit_signal("died")
	# Requirement: is_inside_tree() before queue_free() after await
	# Similar to player, direct free for now.
	queue_free()

func _on_body_entered(body):
	if body.is_in_group("player"):
		# Enemies attack player on contact
		body.take_damage(damage_amount)
