extends Node3D

@export var enemy_scene: PackedScene
@export var spawn_points: Array[Node3D] = []

var game_started = false

func _ready():
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_tree().paused = true

func _input(event):
	if not game_started and event is InputEventMouseButton and event.pressed:
		start_game()

func start_game():
	game_started = true
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	print("Game Started!")
