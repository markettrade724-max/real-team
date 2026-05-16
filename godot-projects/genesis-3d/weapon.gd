extends Node3D

@export var bullet_scene: PackedScene
@export var fire_rate = 0.15
@export var muzzle_point: Node3D

var can_fire = true

func shoot():
    if not can_fire or not bullet_scene or not muzzle_point:
        return
    can_fire = false
    var bullet = bullet_scene.instantiate()
    get_tree().root.add_child(bullet)
    bullet.global_transform = muzzle_point.global_transform
    if bullet.has_method("launch"):
        var direction = -muzzle_point.global_transform.basis.z.normalized()
        bullet.launch(direction * 35.0)
    await get_tree().create_timer(fire_rate).timeout
    can_fire = true
