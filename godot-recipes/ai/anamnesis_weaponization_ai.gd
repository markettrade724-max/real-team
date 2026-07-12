extends CharacterBody3D

@export var lyra_path: NodePath
@export var animation_player_path: NodePath

var _lyra_memory_manager: Node
var _animation_player: AnimationPlayer

var _current_state: String = "idle"
var _active_abilities: Dictionary = {} # Stores callables or data for active abilities
var _state_behaviors: Dictionary = {} # Maps state names to functions

# Dictionary mapping lost memory types to callable methods or behavior modifications
var _memory_reclaim_effects: Dictionary = {
	"CombatManeuver": "reclaim_combat_maneuver",
	"EnvironmentalKnowledge": "reclaim_environmental_knowledge",
	"TacticalRecall": "reclaim_tactical_recall"
}

func _ready() -> void:
	_setup_dependencies()
	_initialize_state_behaviors()
	_set_initial_state("patrol")

func _physics_process(delta: float) -> void:
	_execute_current_state(delta)

func _setup_dependencies() -> void:
	if lyra_path:
		_lyra_memory_manager = get_node_or_null(lyra_path)
		if _lyra_memory_manager and _lyra_memory_manager.has_signal("memory_lost"):
			_lyra_memory_manager.memory_lost.connect(_on_memory_lost)
		else:
			push_error("AnamnesisWeaponizationAI: Lyra/MemoryManager not found or missing 'memory_lost' signal at %s" % lyra_path)
	
	if animation_player_path:
		_animation_player = get_node_or_null(animation_player_path)
		if not _animation_player:
			push_error("AnamnesisWeaponizationAI: AnimationPlayer not found at %s" % animation_player_path)

func _initialize_state_behaviors() -> void:
	_state_behaviors["idle"] = Callable(self, "_state_idle")
	_state_behaviors["patrol"] = Callable(self, "_state_patrol")
	_state_behaviors["hunt"] = Callable(self, "_state_hunt")
	_state_behaviors["enhanced_hunt"] = Callable(self, "_state_enhanced_hunt") # A state that uses reclaimed memories

func _set_initial_state(new_state: String) -> void:
	if _state_behaviors.has(new_state):
		_current_state = new_state
		_on_state_entered(new_state)
	else:
		push_error("AnamnesisWeaponizationAI: Attempted to set unknown state: %s" % new_state)

func _execute_current_state(delta: float) -> void:
	if _state_behaviors.has(_current_state):
		_state_behaviors[_current_state].call(delta)
	else:
		push_error("AnamnesisWeaponizationAI: No behavior defined for current state: %s" % _current_state)

func _on_state_entered(state_name: String) -> void:
	# Play relevant animation or sound when entering a state
	if _animation_player:
		match state_name:
			"idle":
				_animation_player.play("idle_animation")
			"patrol":
				_animation_player.play("patrol_animation")
			"hunt":
				_animation_player.play("hunt_animation")
			"enhanced_hunt":
				_animation_player.play("enhanced_hunt_animation")

func _on_memory_lost(memory_type: String) -> void:
	if _memory_reclaim_effects.has(memory_type):
		var effect_method_name: String = _memory_reclaim_effects[memory_type]
		if has_method(effect_method_name):
			call(effect_method_name)
			_transition_to_enhanced_state()
		else:
			push_warning("AnamnesisWeaponizationAI: Reclaim effect method '%s' not found for memory type '%s'." % [effect_method_name, memory_type])
	else:
		push_warning("AnamnesisWeaponizationAI: No defined reclaim effect for memory type: %s" % memory_type)

func _transition_to_enhanced_state() -> void:
	# Example: After reclaiming a memory, the hunter becomes 'enhanced'
	if _current_state != "enhanced_hunt":
		_set_initial_state("enhanced_hunt")
		print("Hunter entered ENHANCED_HUNT state due to memory reclaim!")

# --- State Behavior Functions ---
func _state_idle(delta: float) -> void:
	# Hunter is idle, waiting for a trigger
	pass

func _state_patrol(delta: float) -> void:
	# Hunter patrols a predefined path
	pass

func _state_hunt(delta: float) -> void:
	# Hunter actively pursues Lyra
	pass

func _state_enhanced_hunt(delta: float) -> void:
	# Hunter pursues Lyra with enhanced abilities from reclaimed memories
	_execute_reclaimed_abilities(delta)
	# Add base hunt logic here too
	_state_hunt(delta) # Can call base hunt logic

# --- Memory Reclaim Effect Functions ---
func reclaim_combat_maneuver() -> void:
	# Example: Hunter gains a new combat move
	_active_abilities["new_attack"] = Callable(self, "_perform_dash_attack")
	print("Hunter reclaimed 'CombatManeuver': gained dash attack!")

func reclaim_environmental_knowledge() -> void:
	# Example: Hunter can now use environmental traps or shortcuts
	_active_abilities["environmental_awareness"] = true
	print("Hunter reclaimed 'EnvironmentalKnowledge': gained environmental awareness!")

func reclaim_tactical_recall() -> void:
	# Example: Hunter can predict Lyra's movements better
	_active_abilities["prediction_boost"] = 1.5
	print("Hunter reclaimed 'TacticalRecall': gained prediction boost!")

func _execute_reclaimed_abilities(delta: float) -> void:
	# This function would be called within the 'enhanced_hunt' state
	if _active_abilities.has("new_attack"):
		# Logic to trigger the new attack based on conditions
		# For simplicity, let's just print it or call the callable directly if conditions met
		# _active_abilities["new_attack"].call() # Would call _perform_dash_attack
		pass # Actual trigger logic would be complex and depend on AI decision making

	if _active_abilities.has("environmental_awareness") and _active_abilities["environmental_awareness"]:
		# Logic to use environmental features, e.g., finding shortcuts or setting traps
		pass

	if _active_abilities.has("prediction_boost"):
		# Adjust movement or targeting based on prediction_boost, e.g., lead target more effectively
		pass

func _perform_dash_attack() -> void:
	# Implement the dash attack logic here
	print("Hunter performs a dash attack!")
	if _animation_player:
		_animation_player.play("dash_attack_animation")