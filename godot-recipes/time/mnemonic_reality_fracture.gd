	extends Control

class_name SplinteredGazeManager

# Parameters for the editor
@export var player_scene: PackedScene
@export var enemy_scene: PackedScene
@export var num_options: int = 3
@export var option_display_size: Vector2 = Vector2(300, 200)
@export var option_spacing: float = 20.0

# Internal state
var _active_viewports: Array[SubViewport] = []
var _active_containers: Array[SubViewportContainer] = []
var _main_player_ref: Node3D
var _main_enemy_ref: Node3D
var _choice_made: bool = false

# Signals
signal choice_made(chosen_action_index: int)

func _ready() -> void:
	# Ensure the manager is hidden until triggered
	visible = false

# Public function to trigger the splintered gaze effect
func trigger_splintered_gaze(main_player: Node3D, main_enemy: Node3D, possible_actions: Array[String]) -> void:
	if _choice_made: # Prevent re-triggering while active
		return

	_main_player_ref = main_player
	_main_enemy_ref = main_enemy
	_choice_made = false
	visible = true
	get_tree().paused = true # Pause main game

	_clear_previous_options() # Clear any old viewports if not cleaned up

	var total_width = (num_options * option_display_size.x) + ((num_options - 1) * option_spacing)
	var start_x = (size.x - total_width) / 2.0

	for i in range(min(num_options, possible_actions.size())):
		var action_name = possible_actions[i]
		var container = SubViewportContainer.new()
		container.size = option_display_size
		container.position = Vector2(start_x + i * (option_display_size.x + option_spacing), (size.y - option_display_size.y) / 2.0)
		container.stretch = true
		add_child(container)
		_active_containers.append(container)

		var viewport = SubViewport.new()
		viewport.size = option_display_size
		viewport.usage = SubViewport.USAGE_3D
		viewport.transparent_bg = true
		viewport.disable_3d = false
		container.add_child(viewport)
		_active_viewports.append(viewport)

		# Instantiate player and enemy into the viewport
		var vp_player = player_scene.instantiate() as Node3D
		var vp_enemy = enemy_scene.instantiate() as Node3D
		viewport.add_child(vp_player)
		viewport.add_child(vp_enemy)

		# Position them relative to the viewport's camera (simple example)
		# In a real game, you'd need a camera in the viewport and proper scene setup
		vp_player.position = Vector3(0, 0, -2)
		vp_enemy.position = Vector3(1, 0, -3)

		# Trigger specific animation for this option
		if vp_player.has_node("AnimationPlayer"): # Assuming AnimationPlayer is a child
			var anim_player = vp_player.get_node("AnimationPlayer") as AnimationPlayer
			if anim_player and anim_player.has_animation(action_name):
				anim_player.play(action_name)
			else:
				print("Warning: Animation '%s' not found for player in viewport %d" % [action_name, i])

		# Create a TextureRect to display the viewport and handle input
		var texture_rect = TextureRect.new()
		texture_rect.texture = viewport.get_texture()
		texture_rect.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
		texture_rect.mouse_filter = Control.MOUSE_FILTER_STOP
		texture_rect.size = option_display_size
		texture_rect.position = Vector2.ZERO # Relative to container
		container.add_child(texture_rect)

		# Store the choice index for the signal
		texture_rect.set_meta("choice_index", i)
		texture_rect.gui_input.connect(Callable(self, "_on_option_selected").bind(i))

func _on_option_selected(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if not _choice_made:
			_choice_made = true
			emit_signal("choice_made", index)
			_apply_choice_to_main_scene(index)
			_cleanup_splintered_gaze()

func _apply_choice_to_main_scene(chosen_index: int) -> void:
	# This is where the chosen action affects the main game world.
	# For simplicity, we'll just print the choice.
	# In a real game, you'd trigger animations, state changes, etc.
	var chosen_action = ""
	if _active_viewports.size() > chosen_index and _active_viewports[chosen_index].get_child_count() > 0:
		var vp_player = _active_viewports[chosen_index].get_child(0) as Node3D
		if vp_player and vp_player.has_node("AnimationPlayer"):
			var anim_player = vp_player.get_node("AnimationPlayer") as AnimationPlayer
			if anim_player:
				chosen_action = anim_player.current_animation

	print("Player chose action: %s (index %d)" % [chosen_action, chosen_index])

	# Example: Trigger the chosen animation on the main player
	if _main_player_ref and _main_player_ref.has_node("AnimationPlayer") and not chosen_action.is_empty():
		var main_anim_player = _main_player_ref.get_node("AnimationPlayer") as AnimationPlayer
		if main_anim_player and main_anim_player.has_animation(chosen_action):
			main_anim_player.play(chosen_action)
		else:
			print("Warning: Main player does not have animation '%s'" % chosen_action)

	# Unpause the game
	get_tree().paused = false

func _clear_previous_options() -> void:
	for container in _active_containers:
		container.queue_free()
	_active_containers.clear()
	_active_viewports.clear()

func _cleanup_splintered_gaze() -> void:
	_clear_previous_options()
	visible = false
	_main_player_ref = null
	_main_enemy_ref = null
	_choice_made = false
