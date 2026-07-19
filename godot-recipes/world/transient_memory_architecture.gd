@tool
extends Node3D

@export var navigation_region_node_path: NodePath
@export var dissolve_shader_material: ShaderMaterial # Assign the ShaderMaterial resource here

var _navigation_region: NavigationRegion3D

func _ready():
	if Engine.is_editor_hint():
		return

	if navigation_region_node_path:
		_navigation_region = get_node_or_null(navigation_region_node_path)
		if not _navigation_region:
			push_error("NavigationRegion3D not found at path: ", navigation_region_node_path)
	else:
		push_error("navigation_region_node_path is not set.")

	_initialize_fragments()
	_bake_navmesh()

func _initialize_fragments():
	for child in get_children():
		if child is MeshInstance3D:
			_apply_dissolve_shader(child)
			_update_fragment_collision(child, child.visible)

func _apply_dissolve_shader(mesh_instance: MeshInstance3D):
	if not dissolve_shader_material or not mesh_instance.mesh:
		return

	for i in range(mesh_instance.mesh.get_surface_count()):
		var existing_material = mesh_instance.mesh.surface_get_material(i)
		var new_material = dissolve_shader_material.duplicate() # Duplicate for independent parameters

		if existing_material is StandardMaterial3D:
			new_material.set_shader_parameter("albedo_texture", existing_material.albedo_texture)
			new_material.set_shader_parameter("albedo_color", existing_material.albedo_color)
			
		mesh_instance.set_surface_override_material(i, new_material)
		# Set initial dissolve_progress based on visibility
		new_material.set_shader_parameter("dissolve_progress", 0.0 if mesh_instance.visible else 1.0)

func toggle_fragment_state(fragment_node: MeshInstance3D, is_active: bool, dissolve_time: float = 1.0):
	if not fragment_node:
		return

	fragment_node.visible = is_active
	_update_fragment_collision(fragment_node, is_active)
	_bake_navmesh()

	# Animate shader parameter for dissolve effect
	if fragment_node.mesh:
		for i in range(fragment_node.mesh.get_surface_count()):
			var material = fragment_node.get_surface_override_material(i)
			if material and material is ShaderMaterial and material.shader == dissolve_shader_material.shader:
				var start_val = material.get_shader_parameter("dissolve_progress")
				var end_val = 0.0 if is_active else 1.0
				var tween = create_tween()
				tween.tween_property(material, "shader_parameter/dissolve_progress", end_val, dissolve_time)
					.from(start_val)
					.set_ease(Tween.EASE_OUT)
					.set_trans(Tween.TRANS_QUAD)

func _update_fragment_collision(fragment_node: MeshInstance3D, enable_collision: bool):
	for child in fragment_node.get_children():
		if child is StaticBody3D:
			# Toggle collision for the StaticBody3D's shapes
			for shape_child in child.get_children():
				if shape_child is CollisionShape3D:
					shape_child.disabled = not enable_collision
			return # Assuming one StaticBody3D per fragment

func _bake_navmesh():
	if _navigation_region and _navigation_region.get_navigation_map().is_valid():
		_navigation_region.bake_navigation_mesh(true) # true for async bake
