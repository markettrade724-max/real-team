extends RigidBody2D

@export var speed: float = 500.0
@export var damage_amount: int = 25
@export var lifetime: float = 2.0 # Seconds before self-destruct

var direction: Vector2 = Vector2.RIGHT

func _ready():
	gravity_scale = 0.0 # Requirement
	contact_monitor = true
	max_contacts_reported = 1
	# Start a timer to queue_free after lifetime
	var timer = get_tree().create_timer(lifetime)
	timer.timeout.connect(on_lifetime_timeout)

func set_direction(dir: Vector2):
	direction = dir.normalized()
	linear_velocity = direction * speed
	rotation = direction.angle() # Point bullet towards direction

func _on_body_entered(body):
	if body.is_in_group("enemy"):
		body.take_damage(damage_amount)
		queue_free_safe() # Destroy bullet on impact

func on_lifetime_timeout():
	queue_free_safe()

func queue_free_safe():
	# Requirement: is_inside_tree() before queue_free() after await
	# In this case, it's not an await, but good practice for deferred freeing.
	# If this bullet was part of an animation or some async process, it would apply.
	# For simple freeing, just queue_free() is often enough, but let's adhere to the spirit.
	if is_inside_tree():
		queue_free()
