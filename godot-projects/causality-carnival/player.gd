extends CharacterBody2D

signal memory_collected(value: int, memory_type: String)
signal player_damaged(amount: int)
signal player_died

@export var move_speed: float = 150.0
@export var health: int = 100
@export var weapon_scene: PackedScene

var current_weapon: Weapon

func _ready():
	add_to_group("player")
	_setup_weapon()

func _setup_weapon():
	if weapon_scene:
		current_weapon = weapon_scene.instantiate()
		add_child(current_weapon)
		# Position weapon relative to player if needed
		current_weapon.position = Vector2(10, 0) # Example offset

func _physics_process(delta):
	_handle_movement()

func _handle_movement():
	var direction = Vector2.ZERO

	# Keyboard/Gamepad input
	direction.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
	direction.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")

	if direction.length() > 0:
		velocity = direction.normalized() * move_speed
	else:
		velocity = Vector2.ZERO

	move_and_slide()

func _unhandled_input(event: InputEvent):
	# Touch-to-shoot or keyboard/gamepad shoot
	if event is InputEventScreenTouch:
		if event.is_pressed():
			# Fire towards the touch position
			if current_weapon:
				current_weapon.fire(current_weapon.global_position, event.position)
	elif event.is_action_pressed("shoot"): # Keyboard/Gamepad shoot
		if current_weapon:
			current_weapon.fire(current_weapon.global_position, get_global_mouse_position()) # Fire towards mouse position

func take_damage(amount: int):
	health -= amount
	player_damaged.emit(amount)
	print("Player took %s damage. Health: %s" % [amount, health])
	if health <= 0:
		_die()

func _die():
	player_died.emit()
	print("Player has succumbed to silence.")
	# Play death animation, show game over screen
	# For now, simply remove
	if is_inside_tree():
		queue_free()

func _on_area_entered(area: Area2D):
	if "MemoryShard" in area.name: # Assuming memory shards are Area2D nodes
		var memory_shard = area as MemoryShard # Requires a MemoryShard script to exist
		if memory_shard:
			memory_collected.emit(memory_shard.value, memory_shard.memory_type)
			memory_shard.collect() # Assumes MemoryShard has a collect() method
