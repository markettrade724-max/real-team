@tool
extends CharacterBody3D

class_name KeeperShadow

# --- Exported Properties ---
@export var movement_speed: float = 3.0
@export var theft_range: float = 2.0
@export var stolen_ability_duration: float = 5.0

# --- Internal State ---
enum State { CHASING, STEALING, USING_STOLEN, FLEEING }
var current_state: State = State.CHASING
var target_node: Node3D = null # Reference to Lyra (Player)
var stolen_ability: Resource = null
var stolen_ability_timer: float = 0.0

# --- Node References ---
@onready var _navigation_agent: NavigationAgent3D = $NavigationAgent3D
@onready var _detection_area: Area3D = $DetectionArea # Area to detect Lyra

# --- Behavior Tree (Simplified State Machine) ---
func _ready() -> void:
	if Engine.is_editor_hint():
		return

	if not _navigation_agent:
		push_error("KeeperShadow requires a NavigationAgent3D child node.")
		set_process(false)
		return

	# Connect to SignalBus for Lyra's ability changes and defeat
	# Disconnect first to prevent multiple connections in editor or hot-reloads
	if SignalBus.is_connected("lyra_ability_equipped", Callable(self, "_on_lyra_ability_equipped")):
		SignalBus.disconnect("lyra_ability_equipped", Callable(self, "_on_lyra_ability_equipped"))
	SignalBus.connect("lyra_ability_equipped", Callable(self, "_on_lyra_ability_equipped"))

	if SignalBus.is_connected("keeper_defeated", Callable(self, "_on_keeper_defeated")):
		SignalBus.disconnect("keeper_defeated", Callable(self, "_on_keeper_defeated"))
	SignalBus.connect("keeper_defeated", Callable(self, "_on_keeper_defeated"))

	# Connect detection area signals
	if _detection_area:
		_detection_area.body_entered.connect(Callable(self, "_on_detection_area_body_entered"))
		_detection_area.body_exited.connect(Callable(self, "_on_detection_area_body_exited"))

func _physics_process(delta: float) -> void:
	if not target_node:
		return

	match current_state:
		State.CHASING:
			_chase_target(delta)
			if _can_steal():
				_perform_theft()
		State.STEALING:
			# This state is momentary, transitions quickly
			pass
		State.USING_STOLEN:
			_use_stolen_ability(delta)
			if stolen_ability_timer <= 0:
				_reset_stolen_ability()
				current_state = State.FLEEING # Flee after using
		State.FLEEING:
			_flee_from_target(delta)

# --- AI Actions ---
func _chase_target(delta: float) -> void:
	_navigation_agent.target_position = target_node.global_position
	var next_path_position: Vector3 = _navigation_agent.get_next_path_position()
	var direction: Vector3 = global_position.direction_to(next_path_position)
	velocity = direction * movement_speed
	move_and_slide()

func _flee_from_target(delta: float) -> void:
	var direction: Vector3 = (global_position - target_node.global_position).normalized()
	velocity = direction * movement_speed * 1.5 # Flee faster
	move_and_slide()
	# If target is out of detection range, return to chasing or patrol
	if not _detection_area.overlaps_body(target_node):
		target_node = null # Lose target
		current_state = State.CHASING

func _can_steal() -> bool:
	if not target_node:
		return false
	var distance_to_target: float = global_position.distance_to(target_node.global_position)
	return distance_to_target <= theft_range and SignalBus.get_lyra_equipped_ability() != null

func _perform_theft() -> void:
	current_state = State.STEALING
	stolen_ability = SignalBus.get_lyra_equipped_ability()
	if stolen_ability:
		SignalBus.emit_signal("ability_stolen", stolen_ability)
		stolen_ability_timer = stolen_ability_duration
		current_state = State.USING_STOLEN
	else:
		current_state = State.CHASING # Failed to steal, go back to chasing

func _use_stolen_ability(delta: float) -> void:
	if stolen_ability:
		# Placeholder: Implement actual ability effect here (e.g., buff self, fire projectile)
		stolen_ability_timer -= delta
	else:
		current_state = State.CHASING # No ability to use

func _reset_stolen_ability() -> void:
	stolen_ability = null
	stolen_ability_timer = 0.0

# --- Signal Callbacks ---
func _on_lyra_ability_equipped(ability: Resource) -> void:
	# Keeper can react to Lyra equipping a new ability
	pass

func _on_keeper_defeated() -> void:
	if stolen_ability:
		SignalBus.emit_signal("ability_returned", stolen_ability)
	queue_free() # Remove self from scene

func _on_detection_area_body_entered(body: Node3D) -> void:
	if body.is_in_group("player"):
		target_node = body
		current_state = State.CHASING

func _on_detection_area_body_exited(body: Node3D) -> void:
	if body == target_node:
		target_node = null
		current_state = State.CHASING # Or patrol, idle, etc.

# --- Health/Damage (Placeholder) ---
func take_damage(amount: float) -> void:
	# In a full game, this would reduce health. For this recipe, it triggers defeat.
	_on_keeper_defeated()
