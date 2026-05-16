extends Node3D

var game_started = false

func _ready():
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    get_tree().paused = true
    process_mode = Node.PROCESS_MODE_ALWAYS

func _input(event):
    if not game_started:
        var is_click = event is InputEventMouseButton and event.pressed
        var is_touch = event is InputEventScreenTouch and event.pressed
        if is_click or is_touch:
            start_game()

func start_game():
    game_started = true
    get_tree().paused = false
    Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
    print("Game Started!")
