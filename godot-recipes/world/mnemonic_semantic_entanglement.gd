class_name SemanticBlightGenerator extends RefCounted

const BLIGHT_SHADER_PATH = "res://SemanticBlightShader.gdshader"

var _blight_intensity: float = 0.0
var _rng: RandomNumberGenerator
var _blight_shader: Shader

func _init():
	_rng = RandomNumberGenerator.new()
	_rng.randomize()
	_blight_shader = load(BLIGHT_SHADER_PATH)
	if not _blight_shader:
		push_error("Failed to load Semantic Blight Shader at: ", BLIGHT_SHADER_PATH)

func set_blight_intensity(intensity: float):
	_blight_intensity = clampf(intensity, 0.0, 1.0)

func apply_semantic_blight(target_node: Node3D, memory_fragments: Array[Resource]):
	if not is_instance_valid(target_node) or memory_fragments.is_empty():
		return

	if target_node is MeshInstance3D:
		_blend_mesh_material(target_node as MeshInstance3D, memory_fragments)
	elif target_node is CSGCombiner3D:
		_corrupt_csg_structure(target_node as CSGCombiner3D, memory_fragments)
	
	if _blight_intensity > 0.3:
		_create_misleading_geometry(target_node, memory_fragments)

func _blend_material_properties(material: ShaderMaterial, fragment_a: Resource, fragment_b: Resource):
	material.set_shader_parameter("albedo_texture_a", fragment_a.albedo_texture)
	material.set_shader_parameter("normal_texture_a", fragment_a.normal_texture)
	material.set_shader_parameter("roughness_texture_a", fragment_a.roughness_texture)
	material.set_shader_parameter("albedo_texture_b", fragment_b.albedo_texture)
	material.set_shader_parameter("normal_texture_b", fragment_b.normal_texture)
	material.set_shader_parameter("roughness_texture_b", fragment_b.roughness_texture)
	material.set_shader_parameter("blend_factor", _blight_intensity)

func _get_random_fragments(fragments: Array[Resource]) -> Array[Resource]:
	if fragments.size() < 2:
		return fragments # Not enough fragments to blend

	var frag_a_idx = _rng.randi_range(0, fragments.size() - 1)
	var frag_b_idx = _rng.randi_range(0, fragments.size() - 1)
	while frag_b_idx == frag_a_idx:
		frag_b_idx = _rng.randi_range(0, fragments.size() - 1)
	
	var fragment_a = fragments[frag_a_idx] as MemoryFragmentResource
	var fragment_b = fragments[frag_b_idx] as MemoryFragmentResource
	
	if not fragment_a or not fragment_b:
		return []

	return [fragment_a, fragment_b]

func _blend_mesh_material(mesh_instance: MeshInstance3D, fragments: Array[Resource]):
	if not _blight_shader:
		return

	var selected_fragments = _get_random_fragments(fragments)
	if selected_fragments.is_empty():
		return

	var new_material = ShaderMaterial.new()
	new_material.shader = _blight_shader
	_blend_material_properties(new_material, selected_fragments[0], selected_fragments[1])
	mesh_instance.material_override = new_material

func _blend_csg_material(csg_shape: CSGShape3D, fragments: Array[Resource]):
	if not _blight_shader:
		return

	var selected_fragments = _get_random_fragments(fragments)
	if selected_fragments.is_empty():
		return

	var new_material = ShaderMaterial.new()
	new_material.shader = _blight_shader
	_blend_material_properties(new_material, selected_fragments[0], selected_fragments[1])
	csg_shape.material = new_material

func _corrupt_csg_structure(csg_combiner: CSGCombiner3D, fragments: Array[Resource]):
	var num_additions = int(round(_blight_intensity * 5.0)) # Up to 5 additions
	for i in range(num_additions):
		var csg_shape: CSGShape3D
		if _rng.randf() < 0.5:
			csg_shape = CSGBox3D.new()
			(csg_shape as CSGBox3D).size = Vector3(_rng.randf_range(0.5, 3.0), _rng.randf_range(0.5, 3.0), _rng.randf_range(0.5, 3.0))
		elif _rng.randf() < 0.75:
			csg_shape = CSGSphere3D.new()
			(csg_shape as CSGSphere3D).radius = _rng.randf_range(0.5, 2.0)
		else:
			csg_shape = CSGCylinder3D.new()
			(csg_shape as CSGCylinder3D).radius = _rng.randf_range(0.5, 2.0)
			(csg_shape as CSGCylinder3D).height = _rng.randf_range(0.5, 4.0)
		
		csg_shape.operation = CSGShape3D.OPERATION_UNION if _rng.randf() < 0.7 else CSGShape3D.OPERATION_SUBTRACTION
		csg_shape.position = Vector3(_rng.randf_range(-5.0, 5.0), _rng.randf_range(-5.0, 5.0), _rng.randf_range(-5.0, 5.0))
		
		_blend_csg_material(csg_shape, fragments)
		
		csg_combiner.add_child(csg_shape)
		csg_shape.owner = csg_combiner # Important for scene saving/loading

func _create_misleading_geometry(parent_node: Node3D, fragments: Array[Resource]):
	if _blight_intensity < 0.3:
		return

	var num_obstacles = int(round(_blight_intensity * 3.0)) # Up to 3 obstacles
	for i in range(num_obstacles):
		var obstacle: CSGBox3D = CSGBox3D.new()
		obstacle.size = Vector3(_rng.randf_range(1.0, 4.0), _rng.randf_range(1.0, 4.0), _rng.randf_range(1.0, 4.0))
		obstacle.position = parent_node.position + Vector3(
			_rng.randf_range(-10.0, 10.0),
			_rng.randf_range(0.0, 5.0),
			_rng.randf_range(-10.0, 10.0)
		)
		obstacle.operation = CSGShape3D.OPERATION_UNION # Always add for misleading pathing
		
		_blend_csg_material(obstacle, fragments) # Apply blended material
		
		parent_node.add_child(obstacle)
		obstacle.owner = parent_node # For runtime additions
