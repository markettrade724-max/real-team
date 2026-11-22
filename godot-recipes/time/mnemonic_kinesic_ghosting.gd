extends Node3D

# Signals
signal lyra_collided_with_ghost(ghost_id: int)
signal enemy_collided_with_ghost(ghost_id: int, enemy_node: Node3D)
signal temporal_stutter_triggered(strength: float)

# Exported Properties
@export var ghost_scene: PackedScene # Scene for the ghost (StaticBody3D + MeshInstance3D + CollisionShape3D)
@export var ghost_lifetime: float = 5.0 # How long ghosts persist
@export var ghost_interval: float = 0.5 # How often ghosts are created
@export var ghost_fade_duration: float = 1.0 # Duration of the fade-out effect
@export var collision_disorient_strength: float = 0.2 # Strength of disorientation on Lyra
@export var collision_attract_silence_strength: float = 0.1 # How much Silence is attracted
@export_flags("Layer 1", "Layer 2", "Layer 3", "Layer 4", "Layer 5", "Layer 6", "Layer 7", "Layer 8", "Layer 9", "Layer 10", "Layer 11", "Layer 12", "Layer 13", "Layer 14", "Layer 15", "Layer 16", "Layer 17", "Layer 18", "Layer 19", "Layer 20") var lyra_collision_layer: int = 1 # Physics layer for Lyra
@export_flags("Layer 1", "Layer 2", "Layer 3", "Layer 4", "Layer 5", "Layer 6", "Layer 7", "Layer 8", "Layer 9", "Layer 10", "Layer 11", "Layer 12", "Layer 13", "Layer 14", "Layer 15", "Layer 16", "Layer 17", "Layer 18", "Layer 19", "Layer 20") var enemy_collision_layer: int = 2 # Physics layer for enemies
@export_flags("Layer 1", "Layer 2", "Layer 3", "Layer 4", "Layer 5", "Layer 6", "Layer 7", "Layer 8", "Layer 9", "Layer 10", "Layer 11", "Layer 12", "Layer 13", "Layer 14", "Layer 15", "Layer 16", "Layer 17", "Layer 18", "Layer 19", "Layer 20") var ghost_collision_layer: int = 4 # Physics layer for ghosts

# Internal State
var _ghosts: Dictionary = {} # {ghost_id: {node: StaticBody3D, material: ShaderMaterial, id: int}}
var _next_ghost_id: int = 0
var _ghost_creation_timer: Timer

func _ready() -> void:
	# Setup ghost creation timer
	_ghost_creation_timer = Timer.new()
	add_child(_ghost_creation_timer)
	_ghost_creation_timer.wait_time = ghost_interval
	_ghost_creation_timer.autostart = true
	_ghost_creation_timer.timeout.connect(Callable(self, "_on_ghost_creation_timer_timeout"))

func _on_ghost_creation_timer_timeout() -> void:
	if not ghost_scene:
		push_warning("Ghost scene not set. Mnemonic Kinesic Ghosting will not function.")
		return

	var lyra_node = get_parent() # Assuming this script is attached to Lyra
	if not lyra_node is Node3D:
		push_error("MnemonicKinesicGhosting expects to be a child of Lyra (Node3D).")
		return

	_create_ghost(lyra_node.global_transform)

func _create_ghost(transform: Transform3D) -> void:
	var ghost_node: StaticBody3D = ghost_scene.instantiate()
	ghost_node.global_transform = transform
	ghost_node.collision_layer = ghost_collision_layer
	ghost_node.collision_mask = lyra_collision_layer | enemy_collision_layer
	ghost_node.body_entered.connect(Callable(self, "_on_ghost_body_entered").bind(_next_ghost_id))
	get_parent().get_parent().add_child(ghost_node) # Add to Lyra's parent (e.g., world root)

	# Get the MeshInstance3D to apply material and tween
	var mesh_instance: MeshInstance3D = ghost_node.find_child("MeshInstance3D")
	var material: ShaderMaterial = null
	if mesh_instance and mesh_instance.mesh and mesh_instance.mesh.get_surface_count() > 0:
		material = mesh_instance.get_active_material(0) as ShaderMaterial
		if material:
			material = material.duplicate() as ShaderMaterial # Ensure unique material for tweening
			mesh_instance.set_surface_override_material(0, material)
			material.set_shader_parameter("fade_alpha", 1.0) # Start fully opaque

	var ghost_data = {
		"node": ghost_node,
		"material": material,
		"id": _next_ghost_id
	}
	_ghosts[_next_ghost_id] = ghost_data

	# Start fade-out timer
	var fade_timer = Timer.new()
	add_child(fade_timer)
	fade_timer.wait_time = ghost_lifetime - ghost_fade_duration
	fade_timer.one_shot = true
	fade_timer.timeout.connect(Callable(self, "_start_ghost_fade_out").bind(ghost_node, material, _next_ghost_id))
	fade_timer.start()

	_next_ghost_id += 1

func _start_ghost_fade_out(ghost_node: StaticBody3D, material: ShaderMaterial, ghost_id: int) -> void:
	if not is_instance_valid(ghost_node):
		_cleanup_ghost(ghost_id)
		return

	if material:
		var tween = create_tween()
		tween.tween_property(material, "shader_parameter/fade_alpha", 0.0, ghost_fade_duration)
		tween.finished.connect(Callable(self, "_cleanup_ghost").bind(ghost_id))
	else:
		# If no material to tween, clean up immediately after lifetime
		_cleanup_ghost(ghost_id)

func _on_ghost_body_entered(body: Node3D, ghost_id: int) -> void:
	if not _ghosts.has(ghost_id):
		return

	# Check if Lyra
	if body.get_collision_layer_value(lyra_collision_layer):
		lyra_collided_with_ghost.emit(ghost_id)
		temporal_stutter_triggered.emit(collision_disorient_strength)
		# Destroy ghost on collision with Lyra
		_start_ghost_fade_out(_ghosts[ghost_id]["node"], _ghosts[ghost_id]["material"], ghost_id)
		return

	# Check if Enemy
	if body.get_collision_layer_value(enemy_collision_layer):
		enemy_collided_with_ghost.emit(ghost_id, body)
		# Modulate enemy AI behavior (e.g., attract them to the ghost's location)
		# This would be handled by the enemy AI script listening to this signal.
		# Destroy ghost on collision with enemy
		_start_ghost_fade_out(_ghosts[ghost_id]["node"], _ghosts[ghost_id]["material"], ghost_id)
		return

func _cleanup_ghost(ghost_id: int) -> void:
	if _ghosts.has(ghost_id):
		var ghost_data = _ghosts.pop(ghost_id)
		var ghost_node: StaticBody3D = ghost_data["node"]
		if is_instance_valid(ghost_node):
			ghost_node.body_entered.disconnect(Callable(self, "_on_ghost_body_entered").bind(ghost_id))
			ghost_node.queue_free()
