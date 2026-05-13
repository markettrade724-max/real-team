extends Node3D

var cube: MeshInstance3D
var label: Label3D
var rotation_speed: float = 1.0

func _ready():
    cube = MeshInstance3D.new()
    cube.mesh = BoxMesh.new()
    cube.mesh.material = StandardMaterial3D.new()
    cube.mesh.material.albedo_color = Color(0.2, 0.6, 1.0)
    cube.position = Vector3(0, 1.5, 0)
    add_child(cube)

    label = Label3D.new()
    label.text = "🎮 Godot Test Game"
    label.font_size = 32
    label.position = Vector3(0, 3.5, 0)
    label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
    add_child(label)

    var light = DirectionalLight3D.new()
    light.position = Vector3(5, 10, 5)
    add_child(light)

    var camera = Camera3D.new()
    camera.position = Vector3(0, 5, 10)
    camera.look_at(Vector3(0, 1.5, 0))
    add_child(camera)

func _process(delta):
    if cube:
        cube.rotate_y(rotation_speed * delta)
        cube.rotate_x(0.5 * rotation_speed * delta)
