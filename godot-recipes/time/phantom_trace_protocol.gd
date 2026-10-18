extends Node3D

@export var lifespan: float = 5.0 # How long the trace persists before despawning
@export var temporal_signature: String = "default_signature" # Unique identifier for hunters
@export var base_trace_color: Color = Color(0.2, 0.8, 1.0, 0.6) # Base color and transparency for the trace
@export var glitch_intensity: float = 0.5 # Visual glitch intensity

signal devoured(trace_id: String, trace_position: Vector3)

var _mesh_instance: MeshInstance3D
var _area_detector: Area3D
var _lifespan_timer: Timer

const PHANTOM_TRACE_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform sampler2D texture_albedo : source_color;
uniform vec4 base_color : source_color = vec4(0.2, 0.8, 1.0, 0.6);
uniform float glitch_intensity : hint_range(0.0, 1.0) = 0.5;
uniform float time_offset = 0.0;

void vertex() {
	float t = TIME + time_offset;
	vec3 offset = vec3(
		sin(t * 10.0 + VERTEX.x * 5.0) * glitch_intensity * 0.05,
		cos(t * 12.0 + VERTEX.y * 5.0) * glitch_intensity * 0.05,
		sin(t * 11.0 + VERTEX.z * 5.0) * glitch_intensity * 0.05
	);
	VERTEX += offset;
}

void fragment() {
	float t = TIME + time_offset;
	vec4 albedo_tex = texture(texture_albedo, UV);
	
	float r_shift = sin(t * 15.0) * glitch_intensity * 0.1;
	float g_shift = cos(t * 17.0) * glitch_intensity * 0.1;
	float b_shift = sin(t * 16.0 + 1.0) * glitch_intensity * 0.1;
	
	vec4 final_color = base_color;
	final_color.r += r_shift;
	final_color.g += g_shift;
	final_color.b += b_shift;
	
	ALBEDO = final_color.rgb * albedo_tex.rgb;
	ALPHA = final_color.a * albedo_tex.a;
	
	EMISSION = ALBEDO.rgb * (sin(t * 20.0) * 0.2 + 0.3) * glitch_intensity;
}
"""

func _ready() -> void:
	# 1. Setup MeshInstance3D for visual representation
	_mesh_instance = MeshInstance3D.new()
	_mesh_instance.name = "MeshInstance3D"
	add_child(_mesh_instance)
	_mesh_instance.owner = self # Important for scene saving/duplication
	
	# Assign a default mesh if none exists (e.g., a simple capsule)
	if not _mesh_instance.mesh:
		var capsule_mesh = CapsuleMesh.new()
		capsule_mesh.radius = 0.3
		capsule_mesh.height = 1.8
		_mesh_instance.mesh = capsule_mesh
	
	# Create and apply the glitch shader material
	var shader = Shader.new()
	shader.code = PHANTOM_TRACE_SHADER_CODE
	var material = ShaderMaterial.new()
	material.shader = shader
	_mesh_instance.set_surface_override_material(0, material)
	
	# Pass initial parameters to the shader
	material.set_shader_parameter("time_offset", randf() * 1000.0) # Randomize glitch start
	material.set_shader_parameter("glitch_intensity", glitch_intensity)
	material.set_shader_parameter("base_color", base_trace_color)
	
	# 2. Setup Area3D for hunter detection
	_area_detector = Area3D.new()
	_area_detector.name = "Area3D"
	add_child(_area_detector)
	_area_detector.owner = self
	
	var collision_shape = CollisionShape3D.new()
	var sphere_shape = SphereShape3D.new()
	sphere_shape.radius = 1.0 # Detection radius for hunters
	collision_shape.shape = sphere_shape
	_area_detector.add_child(collision_shape)
	collision_shape.owner = _area_detector
	
	_area_detector.body_entered.connect(_on_area_body_entered)

	# 3. Setup lifespan timer
	_lifespan_timer = Timer.new()
	_lifespan_timer.wait_time = lifespan
	_lifespan_timer.one_shot = true
	_lifespan_timer.timeout.connect(_on_timer_timeout)
	add_child(_lifespan_timer)
	_lifespan_timer.owner = self
	_lifespan_timer.start()

func devour() -> void:
	# Called by a hunter when it reaches and "consumes" the trace
	emit_signal("devoured", temporal_signature, global_position)
	queue_free()

func _on_timer_timeout() -> void:
	# Trace despawns naturally if not devoured within its lifespan
	queue_free()

func _on_area_body_entered(body: Node3D) -> void:
	# This signal can be used by a hunter to detect the trace.
	# The hunter's AI would then set its NavigationAgent3D target to this trace.
	# For this recipe, we assume the hunter will call devour() once it reaches the trace.
	pass
