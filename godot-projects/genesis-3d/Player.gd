extends CharacterBody3D

@export var speed = 5.0
@export var jump_velocity = 4.5
@export var mouse_sensitivity = 0.002

var gravity = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready():
    Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    # إنشاء السلاح وإضافته إلى نقطة الفوهة
    var weapon_scene = preload("res://Weapon.tscn")
    var weapon = weapon_scene.instantiate()
    $Muzzle.add_child(weapon)

func _input(event):
    if Input.is_action_just_pressed("ui_cancel"):
        Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
    if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
        rotate_y(-event.relative.x * mouse_sensitivity)
        $Camera3D.rotate_x(-event.relative.y * mouse_sensitivity)
        $Camera3D.rotation.x = clamp($Camera3D.rotation.x, -PI/2, PI/2)
    if Input.is_action_just_pressed("fire"):
        var muzzle = $Muzzle
        if muzzle and muzzle.get_child_count() > 0:
            var weapon = muzzle.get_child(0)
            if weapon and weapon.has_method("shoot"):
                weapon.shoot()

func _physics_process(delta):
    velocity.y -= gravity * delta
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_velocity
    var input_dir = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
    var direction = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()
    if direction:
        velocity.x = direction.x * speed
        velocity.z = direction.z * speed
    else:
        velocity.x = move_toward(velocity.x, 0, speed)
        velocity.z = move_toward(velocity.z, 0, speed)
    move_and_slide()
