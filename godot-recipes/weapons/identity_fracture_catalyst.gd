extends Node3D

class_name IdentityFractureCatalyst

signal memory_fragment_consumed(fragment_data: Dictionary, wound_type: String)

@export var base_damage: float = 10.0
@export var particles: GPUParticles3D # Assign in editor
@export var weapon_material: ShaderMaterial # Assign in editor

var current_fragment: MemoryFragment = null

func _ready() -> void:
	if not particles: push_warning("Catalyst: No particles assigned.")
	if not weapon_material: push_warning("Catalyst: No weapon_material assigned.")
	_reset_visual_effects() # Ensure weapon starts in default state

func equip_fragment(fragment: MemoryFragment) -> void:
	if current_fragment:
		push_warning("Catalyst: Fragment already equipped. Consume first.")
		return
	current_fragment = fragment
	_update_visual_parameters()

func activate_catalyst() -> float:
	if not current_fragment:
		push_warning("Catalyst: No fragment equipped.")
		return 0.0
	
	var final_damage: float = base_damage * current_fragment.damage_modifier
	
	_play_activation_effects()
	
	var fragment_data: Dictionary = {
		"fragment_id": current_fragment.fragment_id,
		"emotion_type": current_fragment.emotion_type,
		"associated_skill_potential": current_fragment.associated_skill_potential,
		"wound_description": current_fragment.wound_description
	}
	emit_signal("memory_fragment_consumed", fragment_data, current_fragment.identity_wound_type)
	
	current_fragment = null
	_reset_visual_effects()
	
	return final_damage

func _update_visual_parameters() -> void:
	if not current_fragment: return
	var emotion_color: Color = _get_color_from_emotion(current_fragment.emotion_type)
	if weapon_material:
		weapon_material.set_shader_parameter("emotion_color", emotion_color)
		weapon_material.set_shader_parameter("intensity", 1.0)
	if particles and particles.process_material is ShaderMaterial:
		particles.process_material.set_shader_parameter("emission_color", emotion_color)
		particles.process_material.set_shader_parameter("speed_scale", current_fragment.damage_modifier)

func _play_activation_effects() -> void:
	if particles:
		particles.emitting = true
		particles.restart()

func _reset_visual_effects() -> void:
	if weapon_material:
		weapon_material.set_shader_parameter("emotion_color", Color.WHITE)
		weapon_material.set_shader_parameter("intensity", 0.0)
	if particles:
		particles.emitting = false

func _get_color_from_emotion(emotion: String) -> Color:
	match emotion:
		"Anger": return Color.RED
		"Sorrow": return Color.BLUE
		"Joy": return Color.GREEN
		"Fear": return Color.PURPLE
		_: return Color.WHITE