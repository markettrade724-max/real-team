extends Node2D

@export var lyra_node: CharacterBody2D # Reference to the main player character
@export var echo_scene: PackedScene # Scene for the echo character (should be similar to Lyra)
@export var bifurcation_viewport: SubViewport # The SubViewport to render the echo
@export var bifurcation_overlay: TextureRect # The TextureRect that displays the shader effect
@export var bifurcation_shader: ShaderMaterial # The ShaderMaterial for the overlay

var _echo_instance: CharacterBody2D = null
var _is_bifurcated: bool = false
var _current_control_is_lyra: bool = true # True if Lyra is controlled, false if echo
var _identity_health: float = 100.0
var _stretch_factor: float = 0.0 # 0.0 to 1.0, controls glitch intensity

const MAX_STRETCH_FACTOR: float = 1.0
const STRETCH_PER_USE: float = 0.1
const STRETCH_PER_DAMAGE: float = 0.2

func _ready() -> void:
	# Ensure the viewport is set up for rendering the echo
	bifurcation_viewport.usage = SubViewport.USAGE_2D_NO_SAMPLING
	bifurcation_viewport.transparent_bg = true
	bifurcation_viewport.size = get_viewport_rect().size
	
	# Set the ViewportTexture for the shader
	bifurcation_shader.set_shader_parameter("echo_texture", bifurcation_viewport.get_texture())
	bifurcation_overlay.material = bifurcation_shader
	bifurcation_overlay.visible = false

func _process(delta: float) -> void:
	if Input.is_action_just_pressed("activate_bifurcation"):
		if _is_bifurcated:
			deactivate_bifurcation()
		else:
			activate_bifurcation()
	
	if _is_bifurcated and Input.is_action_just_pressed("switch_control"):
		switch_control()
	
	# Update shader parameters based on identity state
	bifurcation_shader.set_shader_parameter("stretch_factor", _stretch_factor)
	bifurcation_shader.set_shader_parameter("blend_factor", 0.5 if _is_bifurcated else 0.0)

func activate_bifurcation() -> void:
	if _is_bifurcated: return
	
	_is_bifurcated = true
	bifurcation_overlay.visible = true
	
	# Instantiate echo and place it at Lyra's current position
	_echo_instance = echo_scene.instantiate()
	bifurcation_viewport.add_child(_echo_instance)
	_echo_instance.global_position = lyra_node.global_position
	_echo_instance.set_physics_process(false) # Echo is initially static
	
	lyra_node.set_physics_process(true) # Ensure Lyra is controlled
	_current_control_is_lyra = true
	
	apply_identity_stretch(STRETCH_PER_USE)

func deactivate_bifurcation() -> void:
	if not _is_bifurcated: return
	
	_is_bifurcated = false
	bifurcation_overlay.visible = false
	
	if _echo_instance:
		_echo_instance.queue_free()
		_echo_instance = null
	
	lyra_node.set_physics_process(true) # Ensure Lyra is controlled
	_current_control_is_lyra = true

func switch_control() -> void:
	if not _is_bifurcated: return
	
	_current_control_is_lyra = not _current_control_is_lyra
	
	lyra_node.set_physics_process(_current_control_is_lyra)
	if _echo_instance:
		_echo_instance.set_physics_process(not _current_control_is_lyra)
	
	# Update positions to maintain continuity when switching
	if _current_control_is_lyra:
		# If switching back to Lyra, echo snaps to Lyra's current position
		if _echo_instance:
			_echo_instance.global_position = lyra_node.global_position
	else:
		# If switching to echo, Lyra snaps to echo's current position
		lyra_node.global_position = _echo_instance.global_position

func apply_identity_stretch(amount: float) -> void:
	_identity_health = max(0.0, _identity_health - amount * 10.0) # Example health reduction
	_stretch_factor = min(MAX_STRETCH_FACTOR, _stretch_factor + amount)
	
	if _identity_health <= 0.0:
		# Handle game over or severe identity loss
		print("Identity fractured!")

func take_damage_while_bifurcated(damage_amount: float) -> void:
	if _is_bifurcated:
		apply_identity_stretch(STRETCH_PER_DAMAGE)
		# Optionally, apply damage to the currently controlled character
		# if _current_control_is_lyra:
		# 	lyra_node.take_damage(damage_amount)
		# else:
		# 	_echo_instance.take_damage(damage_amount)
