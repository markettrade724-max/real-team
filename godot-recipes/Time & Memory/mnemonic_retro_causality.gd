# mnemonic_retro_causality.gd
extends Node

# This script manages the Echo Reversal Protocol, handling memory fragment decay
# and initiating the rewind effect on MemoryObjects.

signal memory_fragment_decayed(fragment_name: String, effect: String)

@export var rewind_duration: float = 5.0 # Duration for which the object stays rewound
@export var temporal_distortion_material: ShaderMaterial # Assign a ShaderMaterial with temporal_distortion.gdshader

var _active_memory_fragments: Array[Resource] = [] # Array of MemoryFragment resources
var _rewound_objects: Dictionary = {} # Stores {MemoryObject: SceneTreeTimer} for active rewinds

func _ready():
	# Example: Add some initial memory fragments for testing
	# In a real game, these would be loaded or collected by Lyra.
	# Make sure to create 'MemoryFragment.tres' resources in the editor.
	if Engine.is_editor_hint():
		return
	var fragment1 = preload("res://memory_fragment_childhood_home.tres") if ResourceLoader.exists("res://memory_fragment_childhood_home.tres") else null
	var fragment2 = preload("res://memory_fragment_first_star_map.tres") if ResourceLoader.exists("res://memory_fragment_first_star_map.tres") else null
	if fragment1:
		add_memory_fragment(fragment1.duplicate()) # Duplicate to avoid modifying the original resource
	if fragment2:
		add_memory_fragment(fragment2.duplicate())

func add_memory_fragment(fragment: Resource):
	if fragment is MemoryFragment:
		_active_memory_fragments.append(fragment)
		print("Memory Fragment '%s' added." % fragment.fragment_name)
	else:
		push_error("Attempted to add a non-MemoryFragment resource as a memory fragment.")

func get_active_memory_fragments() -> Array[Resource]:
	return _active_memory_fragments

func trigger_echo_reversal(memory_object: Node3D):
	# The core protocol: sacrifice a memory for a temporary rewind.
	if _active_memory_fragments.is_empty():
		print("Cannot trigger Echo Reversal: No memory fragments to sacrifice!")
		return

	# Ensure the target object has the necessary rewind functionality.
	if not memory_object.has_method("start_rewind"):
		push_error("MemoryObject must have a 'start_rewind' method.")
		return

	# Select a fragment to decay (e.g., the last one added, or based on player choice).
	var fragment_to_decay: MemoryFragment = _active_memory_fragments.pop_back() as MemoryFragment
	fragment_to_decay.decay()
	memory_fragment_decayed.emit(fragment_to_decay.fragment_name, fragment_to_decay.effect_on_lyra)

	# Initiate the rewind effect on the MemoryObject.
	memory_object.call("start_rewind", rewind_duration, temporal_distortion_material)

	# Set a timer to revert the object after the rewind duration.
	var timer = get_tree().create_timer(rewind_duration)
	timer.timeout.connect(Callable(memory_object, "end_rewind").bind(true)) # Pass true to indicate timer expiry
	timer.timeout.connect(Callable(self, "_on_rewind_timer_timeout").bind(memory_object))
	_rewound_objects[memory_object] = timer

func _on_rewind_timer_timeout(memory_object: Node3D):
	# Clean up after a rewind timer expires.
	if _rewound_objects.has(memory_object):
		_rewound_objects.erase(memory_object)
		print("Rewind duration ended for object: %s" % memory_object.name)
