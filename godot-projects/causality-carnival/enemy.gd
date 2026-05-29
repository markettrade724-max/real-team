extends CharacterBody2D

@export var move_speed: float = 100.0
@export var health: int = 50
@export var damage_on_hit: int = 10
@export var memory_value_on_death: int = 5 # If enemies drop memory
@export var memory_type_on_death: String = "Fragmented" # Type of memory dropped

var player: CharacterBody2D

func _ready():
	# Find the player node (assuming it's in the "player" group)
	player = get_tree().get_first_node_in_group("player")
	if not player:
		print("Error: Player not found for enemy to target.")
		# Instead of queue_free, perhaps just wander or stay still
		set_process(false) # Disable processing until player is found or new behavior

func _physics_process(delta):
	if player and is_instance_valid(player):
		var direction = (player.global_position - global_position).normalized()
		velocity = direction * move_speed
		move_and_slide()
	else:
		# If player is gone, just stop or wander
		velocity = Vector2.ZERO
		move_and_slide()

func take_damage(amount: int):
	health -= amount
	print("Enemy took %s damage. Health: %s" % [amount, health])
	if health <= 0:
		_die()

func _die():
	print("Enemy vanquished, releasing %s memories." % memory_value_on_death)
	# Emit signal to main scene to spawn memory shard or add to player's memories
	# For now, just queue_free
	if is_inside_tree():
		queue_free()

func _on_body_entered(body: Node2D):
	if body.is_in_group("player"):
		var player_node = body as Player # Requires Player script to exist
		if player_node:
			player_node.take_damage(damage_on_hit)
