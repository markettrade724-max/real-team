extends StaticBody3D

@export var health = 50.0

func _ready():
    add_to_group("enemy")

func take_damage(amount: float):
    health -= amount
    print("Hit target! Health: ", health)
    if health <= 0:
        queue_free()
