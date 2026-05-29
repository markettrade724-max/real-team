extends Node

# Signal for when the player collects a memory
signal memory_collected(memory_value: int)
# Signal for when the player's identity changes or is updated
signal identity_updated

@export var player_scene: PackedScene
@export var enemy_scene: PackedScene
@export var memory_shard_scene: PackedScene

var current_memories: int = 0
var identity_fragments: Array[String] = [] # Represents collected memory shards that form identity

func _ready():
	process_mode = Node.PROCESS_MODE_ALWAYS
	_spawn_player()
	# Connect UI signals here later
	memory_collected.connect(_on_memory_collected)

func _spawn_player():
	var player = player_scene.instantiate()
	add_child(player)
	player.global_position = Vector2(ProjectSettings.get_setting("display/window/size/viewport_width") / 2, ProjectSettings.get_setting("display/window/size/viewport_height") / 2)
	player.memory_collected.connect(memory_collected) # Connect player's signal to main scene

func _on_memory_collected(value: int, memory_type: String):
	current_memories += value
	# Logic for how memory type affects identity
	identity_fragments.append(memory_type)
	identity_updated.emit() # Notify UI or other systems that identity might have changed
	print("Memories collected: %s" % current_memories)
	print("Identity fragments: %s" % identity_fragments)

func _process(delta):
	# Basic enemy spawning or game progression logic
	pass

func _unhandled_input(event: InputEvent):
	# Example: Pause game
	if event.is_action_pressed("ui_cancel"):
		get_tree().paused = not get_tree().paused
		print("Game Paused: %s" % get_tree().paused)
