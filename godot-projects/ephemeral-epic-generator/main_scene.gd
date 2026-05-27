extends Node2D

@export var player_scene: PackedScene
@export var enemy_scene: PackedScene
@export var memory_shard_scene: PackedScene # Assuming a scene for collectable memories

var player_instance: CharacterBody2D
var game_started: bool = false
var score_memories: int = 0
var game_over: bool = false

# Process mode always, as per requirement
func _ready():
	process_mode = Node.PROCESS_MODE_ALWAYS
	start_game()

func start_game():
	if player_scene:
		player_instance = player_scene.instantiate()
		add_child(player_instance)
		player_instance.global_position = get_viewport_rect().size / 2
		player_instance.died.connect(_on_player_died)
		game_started = true
		print("Game started. Player spawned.")
	else:
		push_error("Player scene not assigned in MainScene.")

	# Example: Spawn an initial enemy
	if enemy_scene:
		var enemy = enemy_scene.instantiate()
		add_child(enemy)
		enemy.global_position = Vector2(randf_range(0, get_viewport_rect().size.x), randf_range(0, get_viewport_rect().size.y))
		enemy.died.connect(_on_enemy_died)
		print("Initial enemy spawned.")

func _process(delta):
	if game_over:
		return

	# Example: Simple enemy spawning logic
	if get_tree().get_nodes_in_group("enemy").size() < 3:
		if enemy_scene and randf() < 0.01: # Small chance to spawn an enemy each frame
			var enemy = enemy_scene.instantiate()
			add_child(enemy)
			enemy.global_position = Vector2(randf_range(0, get_viewport_rect().size.x), randf_range(0, get_viewport_rect().size.y))
			enemy.died.connect(_on_enemy_died)

func _on_player_died():
	print("Player died! Game Over.")
	game_over = true
	# Add game over UI, restart options etc.

func _on_enemy_died():
	print("Enemy defeated.")
	# Potentially drop memory shards or advance game state
