extends CharacterBody3D

# Parameters
@export_category("Mnemonic Shardburst Leap")
@export var leap_strength: float = 25.0 # How powerful the initial velocity boost is
@export var leap_duration: float = 0.3  # How long the boost lasts
@export var cooldown_time: float = 1.5  # Cooldown before another leap can be activated
@export var memory_manager_path: NodePath = "/root/MemoryManager" # Path to the MemoryManager singleton

# Internal state
var _is_leaping: bool = false
var _can_leap: bool = true
var _leap_direction: Vector3 = Vector3.ZERO
var _memory_manager: Node = null

# Timers
var _leap_timer: Timer
var _cooldown_timer: Timer

func _ready() -> void:
	_setup_timers()
	_get_memory_manager()

func _setup_timers() -> void:
	_leap_timer = Timer.new()
	add_child(_leap_timer)
	_leap_timer.wait_time = leap_duration
	_leap_timer.one_shot = true
	_leap_timer.timeout.connect(_on_leap_timer_timeout)

	_cooldown_timer = Timer.new()
	add_child(_cooldown_timer)
	_cooldown_timer.wait_time = cooldown_time
	_cooldown_timer.one_shot = true
	_cooldown_timer.timeout.connect(_on_cooldown_timer_timeout)

func _get_memory_manager() -> void:
	_memory_manager = get_node_or_null(memory_manager_path)
	if not _memory_manager:
		push_error("MemoryManager not found at path: %s. Please ensure it's an AutoLoad singleton." % memory_manager_path)

func _physics_process(delta: float) -> void:
	# Apply gravity if not on floor and not actively leaping (leap overrides gravity)
	if not is_on_floor() and not _is_leaping:
		velocity.y -= ProjectSettings.get_setting("physics/3d/default_gravity") * delta
	
	if _is_leaping:
		# Continuously apply the leap velocity during the leap duration
		# This ensures the "gravity-defying" aspect by constantly pushing
		velocity = _leap_direction * leap_strength
		velocity.y = max(velocity.y, leap_strength * 0.7) # Ensure a strong upward component
	
	move_and_slide()

func activate_shardburst_leap(memory_id: String) -> bool:
	if not _can_leap:
		print("Mnemonic Shardburst Leap on cooldown.")
		return false
	if not _memory_manager:
		print("MemoryManager not available. Cannot activate leap.")
		return false

	# Check if the memory exists and can be consumed
	if not _memory_manager.has_memory(memory_id):
		print("Memory '%s' not found or cannot be consumed." % memory_id)
		return false

	# Consume the memory
	_memory_manager.remove_memory(memory_id)
	print("Memory '%s' consumed for Mnemonic Shardburst Leap." % memory_id)

	# Set leap state
	_is_leaping = true
	_can_leap = false
	
	# Determine leap direction based on current movement or forward if stationary
	if velocity.length_squared() > 0.01: # If moving, use current velocity direction
		_leap_direction = velocity.normalized()
	else: # If stationary, leap forward relative to character's facing
		_leap_direction = -global_transform.basis.z.normalized() # Forward direction in local space is -Z

	# Apply initial burst velocity. This will be maintained by _physics_process.
	velocity = _leap_direction * leap_strength
	# Add an upward component for the "gravity-defying surge"
	velocity.y = max(velocity.y, leap_strength * 0.7) # Ensure a strong upward push

	_leap_timer.start()
	_cooldown_timer.start()

	return true

func _on_leap_timer_timeout() -> void:
	_is_leaping = false
	# When leap ends, stop overriding velocity.
	# _physics_process will then revert to normal gravity and movement.
	print("Mnemonic Shardburst Leap ended.")

func _on_cooldown_timer_timeout() -> void:
	_can_leap = true
	print("Mnemonic Shardburst Leap cooldown finished.")

# --- Example MemoryManager (for standalone demonstration) ---
# In a real project, this would be a separate AutoLoad (singleton) script.
# For this recipe to be standalone, it's included as an inner class.
class MemoryManager:
	var _memories: Dictionary = {
		"childhood_home": {"name": "Childhood Home", "value": 10},
		"first_love": {"name": "First Love", "value": 20},
		"mentor_lesson": {"name": "Mentor's Lesson", "value": 15}
	}
	signal memory_lost(memory_id: String)

	func has_memory(memory_id: String) -> bool:
		return _memories.has(memory_id)

	func remove_memory(memory_id: String) -> void:
		if _memories.has(memory_id):
			_memories.erase(memory_id)
			memory_lost.emit(memory_id)
			print("MemoryManager: Lost memory '%s'." % memory_id)
		else:
			push_warning("MemoryManager: Attempted to remove non-existent memory '%s'." % memory_id)
