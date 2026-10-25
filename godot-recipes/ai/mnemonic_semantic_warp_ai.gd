extends Area3D

@export_category("Warp Strider Settings")
@export var warp_radius: float = 20.0
@export var warp_duration: float = 5.0
@export var distortion_strength: float = 0.1
@export var flicker_speed: float = 10.0
@export var time_factor: float = 1.0
@export var navmesh_disable_chance: float = 0.5

const WARP_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float time_factor : hint_range(0.0, 10.0) = 1.0;
uniform float distortion_strength : hint_range(0.0, 1.0) = 0.1;
uniform float flicker_speed : hint_range(0.0, 20.0) = 10.0;
uniform float dissolve_progress : hint_range(0.0, 1.0) = 0.0; // 0.0 = no dissolve, 1.0 = fully dissolved

void vertex() {
	// Basic vertex displacement for instability
	vec3 displacement = NORMAL * (sin(TIME * time_factor + VERTEX.x * 5.0) * 0.5 + 0.5) * distortion_strength;
	VERTEX += displacement;

	// Dissolve effect: push vertices inwards based on dissolve_progress
	VERTEX -= NORMAL * dissolve_progress * 0.5;
}

void fragment() {
	// Flickering transparency
	float flicker = (sin(TIME * flicker_speed) * 0.5 + 0.5);
	ALBEDO = texture(TEXTURE, UV).rgb;
	ALPHA = flicker * (1.0 - dissolve_progress); // Fade out as dissolve progresses

	// Simple dissolve clip based on UV.y (can be improved with noise)
	if (dissolve_progress > 0.0 && UV.y < dissolve_progress) {
		discard;
	}
}
"""

var _warp_shader: Shader
var _warp_material: ShaderMaterial
var _is_warping: bool = false
var _warp_timer: float = 0.0
var _target_player: Node3D
var _affected_meshes: Array[Dictionary] = [] # Stores {mesh: MeshInstance3D, original_material: Material}
var _affected_nav_regions: Array[Dictionary] = [] # Stores {region: NavigationRegion3D, original_enabled: bool}

func _ready() -> void:
	# Ensure Area3D has a collision shape
	if get_children().is_empty() or not (get_children()[0] is CollisionShape3D):
		push_warning("SemanticWarpStrider: Area3D needs a CollisionShape3D child.")
		set_process(false)
		return

	_warp_shader = Shader.new()
	_warp_shader.code = WARP_SHADER_CODE
	_warp_material = ShaderMaterial.new()
	_warp_material.shader = _warp_shader
	_warp_material.set_shader_parameter("distortion_strength", distortion_strength)
	_warp_material.set_shader_parameter("flicker_speed", flicker_speed)
	_warp_material.set_shader_parameter("time_factor", time_factor)

	monitoring = true
	monitorable = false
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _process(delta: float) -> void:
	if _is_warping:
		_warp_timer += delta
		var progress = min(_warp_timer / warp_duration, 1.0)
		_warp_material.set_shader_parameter("dissolve_progress", progress)

		if _warp_timer >= warp_duration:
			_stop_warp_effect()

func _on_body_entered(body: Node3D) -> void:
	if body.is_in_group("player") and not _is_warping:
		_target_player = body
		_start_warp_effect()

func _on_body_exited(body: Node3D) -> void:
	if body == _target_player and _is_warping:
		_stop_warp_effect()

func _start_warp_effect() -> void:
	_is_warping = true
	_warp_timer = 0.0
	_affected_meshes.clear()
	_affected_nav_regions.clear()

	# Find and warp MeshInstance3D nodes
	for node in get_tree().get_nodes_in_group("warp_target_mesh"):
		if node is MeshInstance3D and node.global_position.distance_to(global_position) < warp_radius:
			_affected_meshes.append({"mesh": node, "original_material": node.get_surface_override_material(0)})
			node.set_surface_override_material(0, _warp_material)

	# Find and disable NavigationRegion3D nodes
	for node in get_tree().get_nodes_in_group("warp_target_nav"):
		if node is NavigationRegion3D and node.global_position.distance_to(global_position) < warp_radius:
			_affected_nav_regions.append({"region": node, "original_enabled": node.enabled})
			if randf() < navmesh_disable_chance:
				node.enabled = false # Invalidate local navmesh section

func _stop_warp_effect() -> void:
	_is_warping = false
	_warp_timer = 0.0
	_warp_material.set_shader_parameter("dissolve_progress", 0.0)

	# Restore MeshInstance3D nodes
	for data in _affected_meshes:
		if is_instance_valid(data.mesh):
			data.mesh.set_surface_override_material(0, data.original_material)
	_affected_meshes.clear()

	# Restore NavigationRegion3D nodes
	for data in _affected_nav_regions:
		if is_instance_valid(data.region):
			data.region.enabled = data.original_enabled
	_affected_nav_regions.clear()

	_target_player = null
