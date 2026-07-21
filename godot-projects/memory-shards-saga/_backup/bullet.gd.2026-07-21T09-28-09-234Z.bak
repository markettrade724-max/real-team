extends RigidBody3D

@export var speed: float = 50.0
@export var damage: float = 10.0
@export var lifetime: float = 5.0
var direction: Vector3 = Vector3.FORWARD # Will be set by the weapon

func _ready():
	gravity_scale = 0.0

	# Set collision layer as specified (layer 4)
	set_collision_layer_value(4, true) # This bullet is on layer 4
	# Optionally, set collision mask to define what it collides with.
	# For example, if enemies are on layer 1, you'd set set_collision_mask_value(1, true).
	# By default, RigidBody3D collides with all layers.

	# Set initial velocity based on direction and speed
	linear_velocity = direction * speed

	# Connect the body_entered signal for collision detection
	body_entered.connect(_on_body_entered)

	# Start a timer to despawn the bullet after its lifetime
	await get_tree().create_timer(lifetime).timeout
	# Check if the node is still in the tree before attempting to free it
	if is_inside_tree():
		queue_free()

func _on_body_entered(body: Node3D):
	# Check if the collided body is in the "enemy" group
	if body.is_in_group("enemy"):
		# Attempt to call a 'take_damage' method on the enemy
		if body.has_method("take_damage"):
			body.take_damage(damage)
		# Optional: print for debugging
		# print("Bullet hit enemy: %s, dealt %f damage." % [body.name, damage])

	# The bullet should disappear after hitting something
	# Check if the node is still in the tree before attempting to free it
	if is_inside_tree():
		queue_free()
