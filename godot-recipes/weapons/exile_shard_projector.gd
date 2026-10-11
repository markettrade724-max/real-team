class_name ExileShardProjector extends Node3D

@export_file("*.tscn") var projectile_scene_path: String = "res://memory_shard_projectile.tscn"
@export var projectile_speed: float = 50.0
@export var projectile_damage: float = 25.0
@export var debuff_duration: float = 3.0
@export var muzzle_node_path: NodePath = "Muzzle"

var _muzzle_node: Node3D

func _ready() -> void:
	_muzzle_node = get_node_or_null(muzzle_node_path)
	if not _muzzle_node:
		_muzzle_node = self # Fallback to self if muzzle node not found
		push_warning("Muzzle node not found for ExileShardProjector. Using self as muzzle.")

func fire_shard(shard_resource: MemoryShard) -> void:
	if not shard_resource:
		push_error("Cannot fire null MemoryShard.")
		return

	if not ResourceLoader.exists(projectile_scene_path, "PackedScene"):
		push_error("Projectile scene not found at: " + projectile_scene_path)
		return

	var projectile_scene: PackedScene = ResourceLoader.load(projectile_scene_path)
	var projectile: MemoryShardProjectile = projectile_scene.instantiate()

	if not projectile:
		push_error("Failed to instantiate MemoryShardProjectile.")
		return

	get_tree().root.add_child(projectile)

	projectile.global_transform.origin = _muzzle_node.global_transform.origin
	projectile.linear_velocity = _muzzle_node.global_transform.basis.z * -projectile_speed

	projectile.shard_resource = shard_resource
	projectile.damage_amount = projectile_damage
	projectile.debuff_duration = debuff_duration

	# The shard_resource is now 'consumed' by the projector. 
	# The inventory system (external) should remove it from Lyra's inventory.
	# For this recipe, we just pass it to the projectile.


# --- Supporting Files (for a complete recipe) ---

# filename: memory_shard.gd
# class_name MemoryShard extends Resource
# @export var shard_id: String = ""
# @export var shard_data: Dictionary = {}

# filename: memory_shard_projectile.gd
# class_name MemoryShardProjectile extends RigidBody3D
# @export var explosion_effect_scene: PackedScene # Optional: for visual impact
# var shard_resource: MemoryShard
# var damage_amount: float
# var debuff_duration: float

# func _ready() -> void:
# 	body_entered.connect(_on_body_entered)
# 	# Optional: Add a timer to queue_free if it doesn't hit anything after a while

# func _on_body_entered(body: Node3D) -> void:
# 	if body.has_method("take_damage"):
# 		body.take_damage(damage_amount)
# 	if body.has_method("apply_memory_debuff"):
# 		body.apply_memory_debuff(shard_resource.shard_data, debuff_duration)

# 	# Optional: Instantiate explosion effect
# 	# if explosion_effect_scene:
# 	# 	var effect = explosion_effect_scene.instantiate()
# 	# 	get_tree().root.add_child(effect)
# 	# 	effect.global_transform.origin = global_transform.origin

# 	queue_free()

# filename: memory_distortion_shader.gdshader
# shader_type spatial;
# render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

# uniform float time;
# uniform vec4 shard_color : source_color = vec4(0.8, 0.2, 0.9, 1.0);
# uniform float distortion_strength : hint_range(0.0, 0.2) = 0.05;
# uniform float flicker_intensity : hint_range(0.0, 1.0) = 0.5;
# uniform float flicker_speed : hint_range(1.0, 20.0) = 10.0;

# void vertex() {
# 	vec3 offset = sin(VERTEX.xyz * 10.0 + time * flicker_speed) * distortion_strength;
# 	VERTEX += offset;
# }

# void fragment() {
# 	vec2 distorted_uv = UV + sin(UV * 15.0 + time * flicker_speed) * distortion_strength * 0.5;
# 	vec4 original_albedo = texture(TEXTURE, distorted_uv);
# 	float flicker = sin(time * flicker_speed) * 0.5 + 0.5;
# 	ALBEDO = mix(original_albedo.rgb, shard_color.rgb, flicker * flicker_intensity);
# 	ALPHA = original_albedo.a;
# }
