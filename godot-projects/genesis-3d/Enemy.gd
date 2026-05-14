extends CharacterBody3D

@export var speed = 2.5
@export var attack_range = 1.5
@export var damage = 10
@export var health = 50.0
@export var attack_cooldown = 1.0

var player: Node3D
var can_attack = true
var gravity = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready():
    add_to_group("enemy")
    player = get_tree().get_first_node_in_group("player")

func _physics_process(delta):
    if not player:
        return
    
    velocity.y -= gravity * delta
    
    var distance_to_player = global_position.distance_to(player.global_position)
    var direction = (player.global_position - global_position).normalized()
    
    if distance_to_player > attack_range:
        velocity.x = direction.x * speed
        velocity.z = direction.z * speed
    else:
        velocity.x = 0.0
        velocity.z = 0.0
        if can_attack:
            attack_player()
    
    move_and_slide()

func attack_player():
    if player.has_method("take_damage"):
        player.take_damage(damage)
    can_attack = false
    await get_tree().create_timer(attack_cooldown).timeout
    can_attack = true

func take_damage(amount: float):
    health -= amount
    if health <= 0:
        queue_free()
