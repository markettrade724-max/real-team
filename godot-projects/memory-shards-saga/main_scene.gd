extends Node3D

@export var main_menu_layer: CanvasLayer
@export var pause_menu_layer: CanvasLayer
@export var hud_layer: CanvasLayer # New: For displaying player health, score, etc.
@export var game_over_layer: CanvasLayer # New: For displaying game over screen
@export var victory_layer: CanvasLayer # New: For displaying victory screen
@export var player_scene: PackedScene # New: To instantiate the player

enum GameState {
	MAIN_MENU,
	GAMEPLAY,
	PAUSED,
	GAME_OVER, # New: Added Game Over state
	VICTORY # New: Added Victory state
}

var current_state: GameState = GameState.MAIN_MENU
var _player_instance: CharacterBody3D # To hold the spawned player
var score: int = 0 # New: Score variable

# References to UI Labels (assuming they exist as children in the layers)
var _score_label: Label
var _health_label: Label # Reference for player health display
var _game_over_label: Label
var _victory_label: Label

func _ready():
	process_mode = Node.PROCESS_MODE_ALWAYS
	
	# Get references to labels. Assumes these labels are children of the respective CanvasLayers.
	# For readability (white text, dark background), these properties should be set in the editor.
	if hud_layer:
		if hud_layer.has_node("ScoreLabel"):
			_score_label = hud_layer.get_node("ScoreLabel")
		else:
			push_warning("HUD layer is missing a 'ScoreLabel' child.")
		if hud_layer.has_node("HealthLabel"):
			_health_label = hud_layer.get_node("HealthLabel")
		else:
			push_warning("HUD layer is missing a 'HealthLabel' child.")
	
	if game_over_layer:
		if game_over_layer.has_node("GameOverLabel"):
			_game_over_label = game_over_layer.get_node("GameOverLabel")
		else:
			push_warning("Game Over layer is missing a 'GameOverLabel' child.")
	
	if victory_layer:
		if victory_layer.has_node("VictoryLabel"):
			_victory_label = victory_layer.get_node("VictoryLabel")
		else:
			push_warning("Victory layer is missing a 'VictoryLabel' child.")
	
	_set_game_state(GameState.MAIN_MENU)

func _input(event: InputEvent):
	match current_state:
	    GameState.MAIN_MENU:
	        if (event is InputEventMouseButton and event.is_pressed()) or \
	           (event is InputEventScreenTouch and event.is_pressed()):
	            _set_game_state(GameState.GAMEPLAY)
	            get_viewport().set_input_as_handled()
	    GameState.GAMEPLAY:
	        if event.is_action_pressed("ui_cancel"):
	            _set_game_state(GameState.PAUSED)
	            get_viewport().set_input_as_handled()
	    GameState.PAUSED:
	        if event.is_action_pressed("ui_cancel"):
	            _set_game_state(GameState.GAMEPLAY)
	            get_viewport().set_input_as_handled()
	    GameState.GAME_OVER, GameState.VICTORY: # Allow restarting from game over or victory screen
	        if (event is InputEventMouseButton and event.is_pressed()) or \
	           (event is InputEventScreenTouch and event.is_pressed()) or \
	           event.is_action_pressed("ui_accept"): # Assuming 'ui_accept' for restart
	            get_tree().reload_current_scene() # Simple restart
	            get_viewport().set_input_as_handled()

func _set_game_state(new_state: GameState):
	current_state = new_state
	
	# Hide all layers initially
	if main_menu_layer: main_menu_layer.hide()
	if pause_menu_layer: pause_menu_layer.hide()
	if hud_layer: hud_layer.hide()
	if game_over_layer: game_over_layer.hide()
	if victory_layer: victory_layer.hide() # New: Hide victory layer
	
	get_tree().paused = false # Default to not paused, states will override if needed
	
	match current_state:
	    GameState.MAIN_MENU:
	        if main_menu_layer: main_menu_layer.show()
	        _cleanup_game_elements()
	        score = 0 # Reset score
	        _update_score_display() # Update display
	        
	    GameState.GAMEPLAY:
	        if hud_layer: hud_layer.show() # Show HUD
	        _spawn_player_if_needed()
	        _update_score_display() # Initial score display
	        
	        # Note: For enemies to be counted for the win condition, they must be added
	        # to the "enemy" group (e.g., enemy_instance.add_to_group("enemy"))
	        # and emit a signal (e.g., 'died') that connects to _on_enemy_died when defeated.
	        
	    GameState.PAUSED:
	        get_tree().paused = true
	        if pause_menu_layer: pause_menu_layer.show()
	        
	    GameState.GAME_OVER:
	        if game_over_layer: game_over_layer.show() # Show Game Over screen
	        _update_game_over_display()
	        _cleanup_game_elements()
	        
	    GameState.VICTORY: # New: Victory state handling
	        if victory_layer: victory_layer.show() # Show Victory screen
	        _update_victory_display()
	        _cleanup_game_elements()

func _spawn_player_if_needed():
	# Spawn player if not already present or if returning from main menu
	if not is_instance_valid(_player_instance) and player_scene:
	    _player_instance = player_scene.instantiate()
	    add_child(_player_instance) # Add player to the scene
	    _player_instance.global_position = Vector3(0, 1, 0) # Example spawn position
	    
	    # Connect player signals for game over and HUD updates
	    if _player_instance.has_signal("player_died"):
	        _player_instance.player_died.connect(_on_player_died)
	    if _player_instance.has_signal("player_health_changed"):
	        _player_instance.player_health_changed.connect(_on_player_health_changed)
	    
	    # Initial HUD update
	    if _player_instance.has_method("get_current_health") and _player_instance.has_method("get_max_health"):
	        _on_player_health_changed(_player_instance.get_current_health(), _player_instance.get_max_health())
	    else:
	        push_warning("Player instance does not have get_current_health or get_max_health methods for initial HUD update.")
	elif not player_scene:
	    push_error("Player scene not assigned in main_scene.gd! Cannot start gameplay.")

func _cleanup_game_elements():
	# Clean up player instance
	if is_instance_valid(_player_instance):
	    _player_instance.queue_free()
	    _player_instance = null
	
	# Clean up any remaining enemies (optional, but good for a clean restart)
	for enemy in get_tree().get_nodes_in_group("enemy"):
		enemy.queue_free()

func _on_player_died():
	print("Game Over! Player died.")
	_set_game_state(GameState.GAME_OVER)

func _on_player_health_changed(new_health: int, max_health: int):
	# Update a UI element on the hud_layer with player health
	print("HUD: Player Health: %d/%d" % [new_health, max_health])
	if _health_label:
	    _health_label.text = "HP: %d/%d" % [new_health, max_health]
	else:
	    push_warning("HealthLabel not found on hud_layer for health update.")

# New: Score related functions
func _update_score_display():
	if _score_label:
		_score_label.text = "Score: %d" % score
	else:
		push_warning("ScoreLabel not found on hud_layer for score update.")

# This function should be connected to an enemy's 'died' signal.
# Example: enemy_instance.died.connect(_on_enemy_died)
func _on_enemy_died(points: int = 10):
	score += points
	_update_score_display()
	# The enemy should remove itself from the "enemy" group or queue_free() itself
	# so that get_tree().get_nodes_in_group("enemy").size() updates correctly for the win condition.
	_check_win_condition()
	print("Enemy died! Score: %d" % score)

func _check_win_condition():
	# Checks if all enemies (nodes in the "enemy" group) have been defeated.
	var remaining_enemies = get_tree().get_nodes_in_group("enemy").size()
	print("Remaining enemies: %d" % remaining_enemies)
	if remaining_enemies == 0:
		_set_game_state(GameState.VICTORY)

# New: Game Over and Victory display functions
func _update_game_over_display():
	if _game_over_label:
		_game_over_label.text = "GAME OVER\nFinal Score: %d" % score
	else:
		push_warning("GameOverLabel not found on game_over_layer for display.")

func _update_victory_display():
	if _victory_label:
		_victory_label.text = "VICTORY!\nFinal Score: %d" % score
	else:
		push_warning("VictoryLabel not found on victory_layer for display.")
