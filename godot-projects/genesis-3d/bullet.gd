extends RigidBody3D

var damage = 25.0
var lifetime = 2.0

func _ready():
    await get_tree().create_timer(lifetime).timeout
    queue_free()

func launch(velocity_vector: Vector3):
    linear_velocity = velocity_vector
