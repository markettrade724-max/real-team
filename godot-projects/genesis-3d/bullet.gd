extends RigidBody3D

var damage = 25.0
var lifetime = 2.0

func _ready():
    await get_tree().create_timer(lifetime).timeout
    queue_free()

func launch(velocity_vector: Vector3):
    linear_velocity = velocity_vector

func _on_body_entered(body: Node):
    if body.is_in_group("enemy") and body.has_method("take_damage"):
        body.take_damage(damage)
    queue_free()
