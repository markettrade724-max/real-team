extends Node3D

const BULLET = preload("res://bullet.tscn")

@export var fire_rate: float = 0.2 # Seconds between shots
@export var bullet_speed: float = 50.0
@export var bullet_damage: float = 10.0
@export var bullet_lifetime: float = 5.0

var _can_shoot: bool = true
var _cooldown_timer: Timer
var _muzzle_point: Marker3D

func _ready():
	_muzzle_point = get_node_or_null("muzzle_point")
	if not _muzzle_point:
		push_error("Weapon requires a 'muzzle_point' Marker3D child.")
		set_process(false) # Disable processing if essential node is missing
		return

	_cooldown_timer = Timer.new()
	_cooldown_timer.wait_time = fire_rate
	_cooldown_timer.one_shot = true
	add_child(_cooldown_timer)
	_cooldown_timer.timeout.connect(_on_cooldown_timer_timeout)

func shoot():
	if _can_shoot and _muzzle_point:
		_can_shoot = false
		_cooldown_timer.start()

		var bullet_instance = BULLET.instantiate()
		# Add the bullet to the current scene's root for proper physics interaction
		get_tree().current_scene.add_child(bullet_instance)

		# Set bullet's initial transform to muzzle point's global transform
		bullet_instance.global_transform = _muzzle_point.global_transform

		# Pass properties to the bullet instance
		bullet_instance.speed = bullet_speed
		bullet_instance.damage = bullet_damage
		bullet_instance.lifetime = bullet_lifetime
		# The bullet's forward direction should be the muzzle point's forward direction
		# In Godot's 3D, -Z is typically forward for nodes like cameras and markers.
		bullet_instance.direction = -_muzzle_point.global_transform.basis.z

func _on_cooldown_timer_timeout():
	_can_shoot = true
