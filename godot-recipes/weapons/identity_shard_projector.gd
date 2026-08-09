class_name MemoryShard extends Resource

@export var id: String = ""
@export var display_name: String = ""
@export var description: String = ""
@export var damage: float = 10.0
@export var element_type: String = "kinetic" # e.g., "fire", "ice", "psychic"
@export var status_effect: String = "" # e.g., "stun", "slow", "burn"
@export var void_duration: float = 3.0 # How long the debuff lasts
@export var void_effect_type: String = "blur" # e.g., "blur", "desaturate", "audio_muffle", "skill_loss"
@export var projectile_color: Color = Color.WHITE
@export var erosion_value: float = 0.0 # Increases with use, makes void effects worse

extends Node3D

class_name IdentityShardProjector

# --- Signals ---
signal memory_void_triggered(void_effect_type: String, duration: float)
signal memory_eroded(shard_id: String, new_erosion_value: float)

# --- Exports ---
@export var shard_pool: Array[MemoryShard] = []
@export var projectile_speed: float = 50.0
@export var projectile_lifetime: float = 2.0
@export var projectile_mesh: Mesh = preload("res://default_sphere.tres") # A default sphere mesh
@export var projectile_collision_layer: int = 1
@export var projectile_collision_mask: int = 1

# --- Internal State ---
var _active_shard_index: int = 0
var _shader_code: String = """
shader_type spatial;
render_mode unshaded;

uniform vec4 albedo : source_color;
uniform float glow_intensity : hint_range(0.0, 10.0) = 1.0;

void fragment() {
	ALBEDO = albedo.rgb;
	EMISSION = albedo.rgb * glow_intensity;
}
"""

# --- Public Methods ---
func fire(direction: Vector3) -> void:
	if shard_pool.is_empty():
		return

	var current_shard: MemoryShard = shard_pool[_active_shard_index]
	_consume_shard(current_shard)
	_create_projectile(current_shard, direction)

func set_active_shard(index: int) -> void:
	if index >= 0 and index < shard_pool.size():
		_active_shard_index = index

# --- Private Methods ---
func _consume_shard(shard: MemoryShard) -> void:
	# Apply identity void effect
	memory_void_triggered.emit(shard.void_effect_type, shard.void_duration)

	# Increase erosion and emit signal
	shard.erosion_value += 0.1 # Example erosion increase
	memory_eroded.emit(shard.id, shard.erosion_value)

	# Cycle to the next shard in the pool
	_active_shard_index = (_active_shard_index + 1) % shard_pool.size()

func _create_projectile(shard: MemoryShard, direction: Vector3) -> void:
	var projectile_node = Area3D.new()
	projectile_node.name = "MemoryShardProjectile"
	projectile_node.collision_layer = projectile_collision_layer
	projectile_node.collision_mask = projectile_collision_mask
	projectile_node.monitoring = true
	projectile_node.monitorable = false
	projectile_node.position = global_position
	add_child(projectile_node)

	var mesh_instance = MeshInstance3D.new()
	mesh_instance.mesh = projectile_mesh
	projectile_node.add_child(mesh_instance)

	var collision_shape = CollisionShape3D.new()
	var sphere_shape = SphereShape3D.new()
	sphere_shape.radius = 0.1 # Adjust based on mesh size
	collision_shape.shape = sphere_shape
	projectile_node.add_child(collision_shape)

	var shader = Shader.new()
	shader.code = _shader_code
	var material = ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("albedo", shard.projectile_color)
	material.set_shader_parameter("glow_intensity", 2.0 + shard.erosion_value * 5.0) # Glow increases with erosion
	mesh_instance.material_override = material

	# Simple projectile movement and lifetime
	var velocity = direction.normalized() * projectile_speed
	var timer = get_tree().create_timer(projectile_lifetime)
	timer.timeout.connect(projectile_node.queue_free)

	projectile_node.body_entered.connect(
		func(body: Node3D):
			_handle_projectile_hit(projectile_node, body, shard)
	)

	# Add a script to the projectile for movement
	var projectile_script = GDScript.new()
	projectile_script.source_code = """
extends Area3D
var velocity: Vector3
func _physics_process(delta: float):
	position += velocity * delta
"""
	projectile_node.set_script(projectile_script)
	projectile_node.get_script_instance().set("velocity", velocity)


func _handle_projectile_hit(projectile_node: Area3D, target_body: Node3D, shard: MemoryShard) -> void:
	# Apply combat effects to the target_body
	# This would typically involve calling a method on the target, e.g., target_body.take_damage(shard.damage)
	# For this example, we'll just print.
	print("Projectile hit: %s with damage %f and status %s" % [target_body.name, shard.damage, shard.status_effect])
	projectile_node.queue_free() # Destroy projectile on hit
