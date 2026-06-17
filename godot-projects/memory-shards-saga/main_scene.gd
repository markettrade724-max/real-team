extends Node3D

@export var main_menu_layer: CanvasLayer
@export var pause_menu_layer: CanvasLayer # Optional: For a complete pause system

enum GameState {
	MAIN_MENU,
	GAMEPLAY,
	PAUSED
}

var current_state: GameState = GameState.MAIN_MENU

func _ready():
	# Rule: process_mode = ALWAYS
	process_mode = Node.PROCESS_MODE_ALWAYS
	
	# Initialize the game state to MAIN_MENU
	_set_game_state(GameState.MAIN_MENU)

func _input(event: InputEvent):
	match current_state:
	    GameState.MAIN_MENU:
	        # Rule: handle InputEventMouseButton + InputEventScreenTouch to start game
	        if (event is InputEventMouseButton and event.is_pressed()) or \
	           (event is InputEventScreenTouch and event.is_pressed()):
	            _set_game_state(GameState.GAMEPLAY)
	            get_viewport().set_input_as_handled() # Consume the event to prevent further propagation
	    GameState.GAMEPLAY:
	        # Rule: pause / unpause logic with get_tree().paused
	        # Assuming "ui_cancel" (Escape key by default) is used for pausing
	        if event.is_action_pressed("ui_cancel"):
	            _set_game_state(GameState.PAUSED)
	            get_viewport().set_input_as_handled()
	    GameState.PAUSED:
	        # Rule: pause / unpause logic with get_tree().paused
	        # Assuming "ui_cancel" (Escape key by default) is used for unpausing
	        if event.is_action_pressed("ui_cancel"):
	            _set_game_state(GameState.GAMEPLAY)
	            get_viewport().set_input_as_handled()

func _set_game_state(new_state: GameState):
	current_state = new_state
	
	match current_state:
	    GameState.MAIN_MENU:
	        get_tree().paused = false # Game is not paused, but in a menu state where gameplay isn't active
	        if main_menu_layer:
	            main_menu_layer.show()
	        if pause_menu_layer:
	            pause_menu_layer.hide()
	        # Any other main menu specific setup (e.g., reset game state)
	        
	    GameState.GAMEPLAY:
	        get_tree().paused = false # Ensure game is unpaused for active gameplay
	        if main_menu_layer:
	            main_menu_layer.hide()
	        if pause_menu_layer:
	            pause_menu_layer.hide()
	        # Any other gameplay specific setup (e.g., start level, spawn player, resume music)
	        
	    GameState.PAUSED:
	        get_tree().paused = true # Pause the game, stopping most game logic
	        if main_menu_layer:
	            main_menu_layer.hide()
	        if pause_menu_layer:
	            pause_menu_layer.show() # Show the pause menu if it exists
	        # Any other pause specific setup (e.g., show pause screen, dim background)