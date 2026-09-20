extends Control

class MemoryShard:
	var id: int
	var node: TextureRect
	var angle: float
	var orbit_radius: float
	var current_drift: float = 0.0
	var max_drift: float
	var anchored_timer: float = 0.0
	var is_anchored: bool = false
	var is_lost: bool = false

	func _init(p_id: int, p_node: TextureRect, p_angle: float, p_radius: float, p_max_drift: float):
		id = p_id
		node = p_node
		angle = p_angle
		orbit_radius = p_radius
		max_drift = p_max_drift

@export var core_texture: Texture2D
@export var shard_texture: Texture2D
@export var num_shards: int = 5
@export var base_orbit_radius: float = 100.0
@export var orbit_speed: float = 0.5
@export var stress_drift_multiplier: float = 0.1
@export var max_shard_drift: float = 50.0
@export var anchor_duration: float = 1.0
@export var shard_size: Vector2 = Vector2(32, 32)

var _core_node: TextureRect
var _shards: Array[MemoryShard]
var _current_stress: float = 0.0
var _center: Vector2

signal shard_lost(shard_id: int)
signal shard_anchored(shard_id: int)

func _ready() -> void:
	_center = size / 2.0
	_setup_core()
	_setup_shards()

func _setup_core() -> void:
	_core_node = TextureRect.new()
	_core_node.texture = core_texture
	_core_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_core_node.custom_minimum_size = Vector2(64, 64)
	_core_node.pivot_offset = _core_node.custom_minimum_size / 2.0
	add_child(_core_node)
	_core_node.position = _center - _core_node.custom_minimum_size / 2.0

func _setup_shards() -> void:
	for i in range(num_shards):
		var shard_node = TextureRect.new()
		shard_node.texture = shard_texture
		shard_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		shard_node.custom_minimum_size = shard_size
		shard_node.pivot_offset = shard_size / 2.0
		shard_node.material = ShaderMaterial.new()
		shard_node.material.shader = load("res://shard_material.gdshader")
		add_child(shard_node)

		var angle = (float(i) / num_shards) * TAU
		var shard = MemoryShard.new(i, shard_node, angle, base_orbit_radius, max_shard_drift)
		_shards.append(shard)

func _process(delta: float) -> void:
	_center = size / 2.0
	_core_node.position = _center - _core_node.custom_minimum_size / 2.0

	for shard in _shards:
		if shard.is_lost:
			continue

		shard.angle += orbit_speed * delta

		if not shard.is_anchored:
			shard.current_drift += _current_stress * stress_drift_multiplier * delta
			shard.current_drift = min(shard.current_drift, shard.max_drift)
		else:
			shard.anchored_timer -= delta
			if shard.anchored_timer <= 0:
				shard.is_anchored = false
				shard.current_drift *= 0.5

		var current_radius = shard.orbit_radius + shard.current_drift
		var x = _center.x + cos(shard.angle) * current_radius
		var y = _center.y + sin(shard.angle) * current_radius
		shard.node.position = Vector2(x, y) - shard.node.custom_minimum_size / 2.0

		if shard.node.material is ShaderMaterial:
			shard.node.material.set_shader_parameter("stress_level", shard.current_drift / shard.max_drift)
			shard.node.material.set_shader_parameter("is_anchored", float(shard.is_anchored))

		if shard.current_drift >= shard.max_drift * 0.99:
			_lose_shard(shard)

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		for shard in _shards:
			if shard.is_lost:
				continue
			var global_pos = get_global_transform().origin + shard.node.position
			var rect = Rect2(global_pos, shard.node.custom_minimum_size)
			if rect.has_point(event.global_position):
				_anchor_shard(shard)
				accept_event()
				return

func add_stress(amount: float) -> void:
	_current_stress = clamp(_current_stress + amount, 0.0, 1.0)

func reduce_stress(amount: float) -> void:
	_current_stress = clamp(_current_stress - amount, 0.0, 1.0)

func _anchor_shard(shard: MemoryShard) -> void:
	if not shard.is_anchored:
		shard.is_anchored = true
		shard.anchored_timer = anchor_duration
		shard.current_drift = max(0.0, shard.current_drift - shard.max_drift * 0.2)
		shard_anchored.emit(shard.id)

func _lose_shard(shard: MemoryShard) -> void:
	if not shard.is_lost:
		shard.is_lost = true
		shard.node.queue_free()
		shard_lost.emit(shard.id)
