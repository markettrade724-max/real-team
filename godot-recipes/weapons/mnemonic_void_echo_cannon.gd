class_name VoidEchoProjectile
extends Area3D

# Projectile properties
@export var speed: float = 20.0
@export var damage: float = 25.0
@export var lifetime: float = 3.0

# Signals for player feedback and resource management
signal void_echo_fired(cost_amount: float) # Emitted when fired, for resource tracking
signal player_identity_tremor(duration: float, intensity: float) # Emitted on impact, for screen effect/debuff

var _direction: Vector3 = Vector3.FORWARD
var _player_node: Node # Reference to the player node to emit signals

const PROJECTILE_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float time_factor : hint_range(0.0, 1.0) = 0.5;
uniform vec4 color : source_color = vec4(0.2, 0.0, 0.4, 0.8);
uniform float distortion_strength : hint_range(0.0, 1.0) = 0.1;

void vertex() {
	// Standard vertex transformation
}

void fragment() {
	// Simple time-based distortion for self-appearance
	float distort = sin(TIME * 5.0 + VERTEX.x * 10.0) * cos(TIME * 3.0 + VERTEX.y * 8.0);
	distort = distort * distortion_strength;
	
	ALBEDO = color.rgb;
	ALPHA = color.a * (1.0 - abs(distort)); // More distorted, more transparent
	
	// Add an emission effect
	EMISSION = color.rgb * (1.0 + abs(distort) * 2.0);
}
"""

const ENEMY_IMPACT_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform float effect_progress : hint_range(0.0, 1.0) = 0.0; // 0.0 = no effect, 1.0 = full effect
uniform sampler2D texture_albedo : source_color; // Original albedo texture (if any)

void fragment() {
	vec4 base_color = ALBEDO_TEXTURE == null ? vec4(ALBEDO, ALPHA) : texture(ALBEDO_TEXTURE, UV);
	
	// Desaturation effect
	float gray = dot(base_color.rgb, vec3(0.299, 0.587, 0.114));
	vec3 desaturated_color = mix(base_color.rgb, vec3(gray), effect_progress);
	
	// Subtle warp/noise effect
	vec2 distorted_uv = UV + vec2(sin(UV.x * 10.0 + TIME * 5.0) * 0.01 * effect_progress, 
	                              cos(UV.y * 8.0 + TIME * 4.0) * 0.01 * effect_progress);
	vec4 warped_color = ALBEDO_TEXTURE == null ? vec4(ALBEDO, ALPHA) : texture(ALBEDO_TEXTURE, distorted_uv);
	
	ALBEDO = mix(desaturated_color, warped_color.rgb, effect_progress * 0.5); // Blend desat and warp
	ALPHA = base_color.a;
	
	// Optional: Add a subtle void-like emission
	EMISSION = vec3(0.1, 0.0, 0.2) * effect_progress;
}
"""

func _ready() -> void:
	# Setup collision shape
	var collision_shape = CollisionShape3D.new()
	var sphere_shape = SphereShape3D.new()
	sphere_shape.radius = 0.2
	collision_shape.shape = sphere_shape
	add_child(collision_shape)
	
	# Setup mesh
	var mesh_instance = MeshInstance3D.new()
	var sphere_mesh = SphereMesh.new()
	sphere_mesh.radius = 0.2
	sphere_mesh.height = 0.4
	mesh_instance.mesh = sphere_mesh
	
	var projectile_shader = Shader.new()
	projectile_shader.code = PROJECTILE_SHADER_CODE
	var projectile_material = ShaderMaterial.new()
	projectile_material.shader = projectile_shader
	mesh_instance.material_override = projectile_material
	add_child(mesh_instance)
	
	# Connect signals
	body_entered.connect(_on_body_entered)
	
	# Set up a timer for lifetime
	var lifetime_timer = Timer.new()
	lifetime_timer.wait_time = lifetime
	lifetime_timer.one_shot = true
	lifetime_timer.timeout.connect(queue_free)
	add_child(lifetime_timer)
	lifetime_timer.start()

func _physics_process(delta: float) -> void:
	global_position += _direction * speed * delta

func initialize(direction: Vector3, player_node: Node) -> void:
	_direction = direction.normalized()
	_player_node = player_node
	void_echo_fired.emit(1.0) # Emit cost when fired

func _on_body_entered(body: Node3D) -> void:
	if body.has_method("take_damage"):
		body.take_damage(damage)
	
	# Apply temporary visual effect to enemy (requires enemy to have a method for this)
	if body.has_method("apply_void_impact_effect"):
		var enemy_impact_shader = Shader.new()
		enemy_impact_shader.code = ENEMY_IMPACT_SHADER_CODE
		var enemy_impact_material = ShaderMaterial.new()
		enemy_impact_material.shader = enemy_impact_shader
		# Pass original albedo texture if available, otherwise shader will use base ALBEDO
		if body is MeshInstance3D and body.get_active_material(0) is StandardMaterial3D:
			var original_material = body.get_active_material(0) as StandardMaterial3D
			if original_material.albedo_texture:
				enemy_impact_material.set_shader_parameter("texture_albedo", original_material.albedo_texture)
		
		body.apply_void_impact_effect(enemy_impact_material, 0.7) # Duration 0.7s
	
	# Trigger player feedback
	if _player_node:
		player_identity_tremor.emit(0.7, 0.5) # Duration 0.7s, intensity 0.5
	
	queue_free()
