extends Node3D

# Signals for player interaction
signal identity_gained(amount: float)
signal identity_lost(amount: float)

# --- Exported Properties ---
@export_group("Fragment Appearance")
@export var fragment_mesh: Mesh
@export var vital_color: Color = Color.LIME_GREEN
@export var corrupted_color: Color = Color.DARK_RED
@export var fragment_scale: float = 0.1

@export_group("Fragment Behavior")
@export var fragment_lifetime: float = 3.0 # Seconds until fragment despawns
@export var fragment_speed_min: float = 1.0
@export var fragment_speed_max: float = 3.0
@export var fragment_angular_speed_min: float = 1.0
@export var fragment_angular_speed_max: float = 5.0
@export var vital_fragment_ratio: float = 0.7 # Percentage of vital fragments
@export var fragment_count_min: int = 5
@export var fragment_count_max: int = 15
@export var identity_gain_amount: float = 10.0
@export var identity_loss_amount: float = 5.0

@export_group("Particle Effect (Visual Only)")
@export var unravel_particles_scene: PackedScene # GPUParticles3D scene for visual burst

# --- Internal Resources ---
const FRAGMENT_SHADER_CODE = """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

uniform vec4 vital_color : source_color;
uniform vec4 corrupted_color : source_color;
uniform bool is_vital;
uniform float lifetime_ratio; // 0.0 (start) to 1.0 (end)

void fragment() {
	vec4 base_color = is_vital ? vital_color : corrupted_color;
	
	// Fade out towards the end of lifetime
	float alpha = 1.0 - smoothstep(0.7, 1.0, lifetime_ratio);
	
	// Add a subtle flicker/glow for vital fragments
	if (is_vital) {
		float flicker = sin(TIME * 10.0) * 0.1 + 0.9;
		base_color.rgb *= flicker;
	}
	
	ALBEDO = base_color.rgb;
	ALPHA = alpha;
	EMISSION = base_color.rgb * (1.0 - lifetime_ratio) * 0.5; // Subtle emission
}
"""

# --- Public Methods ---

func spawn_memory_fragments(spawn_position: Vector3):
	# Play visual unraveling effect
	if unravel_particles_scene:
		var particles_instance = unravel_particles_scene.instantiate()
		get_tree().root.add_child(particles_instance)
		particles_instance.global_transform.origin = spawn_position
		particles_instance.emitting = true
		# The GPUParticles3D scene should be configured to one_shot and queue_free on finish.

	var fragment_count = randi_range(fragment_count_min, fragment_count_max)
	for i in range(fragment_count):
		var is_vital = randf() < vital_fragment_ratio
		_create_and_launch_fragment(spawn_position, is_vital)

# --- Private Methods ---

func _create_and_launch_fragment(spawn_position: Vector3, is_vital: bool):
	var fragment_area = Area3D.new()
	fragment_area.name = "MemoryFragment"
	fragment_area.collision_layer = 0b00000000000000000000000000000001 # Layer 1 for fragments
	fragment_area.collision_mask = 0b00000000000000000000000000000010 # Mask 2 for player
	fragment_area.monitoring = true
	fragment_area.monitorable = false # Fragments don't monitor other areas

	# Add MeshInstance3D
	var mesh_instance = MeshInstance3D.new()
	mesh_instance.mesh = fragment_mesh
	mesh_instance.scale = Vector3.ONE * fragment_scale
	fragment_area.add_child(mesh_instance)

	# Create and apply ShaderMaterial
	var shader = Shader.new()
	shader.code = FRAGMENT_SHADER_CODE
	var material = ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("is_vital", is_vital)
	material.set_shader_parameter("vital_color", vital_color)
	material.set_shader_parameter("corrupted_color", corrupted_color)
	mesh_instance.material_override = material

	# Add CollisionShape3D (assuming fragment_mesh has a valid shape)
	var collision_shape = CollisionShape3D.new()
	if fragment_mesh:
		var shape = fragment_mesh.create_convex_shape()
		if shape:
			collision_shape.shape = shape
		else:
			# Fallback to a simple sphere if convex shape creation fails
			var sphere_shape = SphereShape3D.new()
			sphere_shape.radius = fragment_scale * 0.5
			collision_shape.shape = sphere_shape
	else:
		# Default to a sphere if no mesh is provided
		var sphere_shape = SphereShape3D.new()
		sphere_shape.radius = fragment_scale * 0.5
		collision_shape.shape = sphere_shape
	fragment_area.add_child(collision_shape)

	# Set initial position and random velocity/rotation
	fragment_area.global_transform.origin = spawn_position
	var random_direction = Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).normalized()
	var speed = randf_range(fragment_speed_min, fragment_speed_max)
	var velocity = random_direction * speed

	var angular_velocity = Vector3(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)).normalized() * randf_range(fragment_angular_speed_min, fragment_angular_speed_max)

	# Store properties on the fragment for later use
	fragment_area.set_meta("is_vital", is_vital)
	fragment_area.set_meta("lifetime", fragment_lifetime)
	fragment_area.set_meta("current_lifetime", 0.0)
	fragment_area.set_meta("velocity", velocity)
	fragment_area.set_meta("angular_velocity", angular_velocity)
	fragment_area.set_meta("material", material) # Store material to update shader params

	# Connect signals
	fragment_area.body_entered.connect(Callable(self, "_on_fragment_body_entered").bind(fragment_area))

	get_tree().root.add_child(fragment_area) # Add to root to ensure it's independent

	# Start a timer for despawn
	var timer = Timer.new()
	timer.wait_time = fragment_lifetime
	timer.one_shot = true
	timer.timeout.connect(fragment_area.queue_free)
	fragment_area.add_child(timer)
	timer.start()

	# Add a script to the fragment for physics and shader updates
	var fragment_script = GDScript.new()
	fragment_script.source_code = """
extends Area3D

func _physics_process(delta):
	var current_lifetime = get_meta("current_lifetime") + delta
	set_meta("current_lifetime", current_lifetime)
	
	var lifetime_ratio = current_lifetime / get_meta("lifetime")
	var material = get_meta("material")
	if material:
		material.set_shader_parameter("lifetime_ratio", lifetime_ratio)
	
	# Apply velocity
	global_transform.origin += get_meta("velocity") * delta
	
	# Apply angular velocity
	var angular_velocity = get_meta("angular_velocity")
	var rotation_delta = Basis(angular_velocity * delta)
	global_transform.basis = global_transform.basis * rotation_delta
"""
	fragment_area.set_script(fragment_script)


func _on_fragment_body_entered(body: Node3D, fragment_area: Area3D):
	# Assuming 'Player' is the name or group of the player node
	# Or check for a specific component/script on the player
	# The player node should be on collision layer 2 to interact with fragments on mask 2.
	if body.has_method("is_player") and body.is_player(): # Example check for player
		var is_vital = fragment_area.get_meta("is_vital")
		if is_vital:
			identity_gained.emit(identity_gain_amount)
		else:
			identity_lost.emit(identity_loss_amount)
		fragment_area.queue_free() # Fragment collected/contacted, so remove it
