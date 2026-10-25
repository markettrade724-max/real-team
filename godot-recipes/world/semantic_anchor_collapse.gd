extends Node3D

@export var memory_ID: String = "" # Unique identifier for the memory fragment this anchor represents.
@export var memory_type: String = "default" # Semantic type of the memory (e.g., "path", "shelter").
@export var collapse_strength: float = 0.5 # How intensely the geometry deforms.

var _mesh_instance: MeshInstance3D
var _collision_shape: CollisionShape3D
var _navigation_region: NavigationRegion3D

func _ready():
	if memory_ID.is_empty():
		push_warning("SemanticAnchorCollapse: 'memory_ID' is not set. This anchor will not react to memory loss.")
		set_process(false)
		return

	_mesh_instance = find_child("MeshInstance3D")
	if not _mesh_instance:
		push_error("SemanticAnchorCollapse: No 'MeshInstance3D' child found.")
		set_process(false)
		return

	if not _mesh_instance.mesh is ArrayMesh:
		push_error("SemanticAnchorCollapse: 'MeshInstance3D's mesh is not an 'ArrayMesh'. Cannot deform.")
		set_process(false)
		return

	_collision_shape = find_child("CollisionShape3D")
	if not _collision_shape:
		push_warning("SemanticAnchorCollapse: No 'CollisionShape3D' child found. Collision will not be updated.")

	# Find the nearest 'NavigationRegion3D' in the scene tree hierarchy.
	_navigation_region = get_parent()
	while _navigation_region and not _navigation_region is NavigationRegion3D:
		_navigation_region = _navigation_region.get_parent()
	if not _navigation_region:
		push_warning("SemanticAnchorCollapse: No 'NavigationRegion3D' found in parent hierarchy. Navigation mesh will not be updated.")

	# Connect to the global 'MemoryManager' singleton signal.
	if Engine.has_singleton("MemoryManager"):
		var memory_manager = Engine.get_singleton("MemoryManager")
		memory_manager.memory_lost.connect(_on_memory_lost)
	else:
		push_error("SemanticAnchorCollapse: 'MemoryManager' singleton not found. Please add 'memory_manager.gd' as an Autoload.")
		set_process(false)

func _on_memory_lost(lost_id: String):
	if lost_id == memory_ID:
		print("Memory ID '", memory_ID, "' lost. Initiating collapse.")
		_deform_mesh()
		_update_collision_shape()
		_update_navigation_mesh()

func _deform_mesh():
	var current_mesh: ArrayMesh = _mesh_instance.mesh
	var mesh_data_tool = MeshDataTool.new()

	# Assuming the mesh has at least one surface to deform.
	if current_mesh.get_surface_count() == 0:
		push_error("SemanticAnchorCollapse: Mesh has no surfaces to deform.")
		return

	mesh_data_tool.create_from_surface(current_mesh, 0)

	_apply_procedural_deformation(mesh_data_tool)

	current_mesh.clear_surfaces()
	mesh_data_tool.commit_to_surface(current_mesh)

func _apply_procedural_deformation(mesh_data_tool: MeshDataTool):
	# Simple collapse: move vertices downwards and slightly inwards.
	for i in range(mesh_data_tool.get_vertex_count()):
		var vertex = mesh_data_tool.get_vertex(i)
		var normal = mesh_data_tool.get_vertex_normal(i)

		# Move vertex down based on normal and collapse strength.
		vertex -= normal * collapse_strength * 0.1 # Slight inward/downward push.
		vertex.y -= collapse_strength * 0.5 # More direct downward collapse.

		# Add some noise for a more organic crumble effect.
		var noise_offset = Vector3(
			randf_range(-0.1, 0.1),
			randf_range(-0.05, 0.05),
			randf_range(-0.1, 0.1)
		) * collapse_strength
		vertex += noise_offset

		mesh_data_tool.set_vertex(i, vertex)

func _update_collision_shape():
	if not _collision_shape:
		return

	var current_mesh: ArrayMesh = _mesh_instance.mesh
	var new_shape = ConcavePolygonShape3D.new()

	var arrays = current_mesh.surface_get_arrays(0)
	var vertices = arrays[ArrayMesh.ARRAY_VERTEX]
	var indices = arrays[ArrayMesh.ARRAY_INDEX]

	# 'ConcavePolygonShape3D' expects an array of vertices, not indexed triangles.
	# Expand the indexed vertices into a flat array of triangle vertices.
	var faces: PackedVector3Array = PackedVector3Array()
	if indices.size() > 0:
		for i in range(0, indices.size(), 3):
			faces.append(vertices[indices[i]])
			faces.append(vertices[indices[i+1]])
			faces.append(vertices[indices[i+2]])
	else:
		# If no indices, assume vertices are already triangles.
		faces = vertices

	new_shape.set_faces(faces)
	_collision_shape.shape = new_shape

func _update_navigation_mesh():
	if not _navigation_region:
		return

	# Create 'NavigationMeshSourceGeometryData3D' to collect geometry for baking.
	var source_geometry_data = NavigationMeshSourceGeometryData3D.new()
	# Add the deformed 'MeshInstance3D' to the source data.
	source_geometry_data.add_mesh_instance(_mesh_instance)

	# Bake the navigation mesh for this region using the updated geometry.
	NavigationServer3D.region_bake_navigation_mesh(
		_navigation_region.get_rid(),
		source_geometry_data
	)
	print("Navigation mesh for region '", _navigation_region.name, "' updated.")

# --- MemoryManager Singleton (for demonstration/testing) ---
# This would typically be a separate Autoload script named 'memory_manager.gd'
# and configured in Project Settings -> Autoload.
# For this recipe, we assume it exists as a global singleton.
# If you need to test this recipe standalone without setting up the Autoload,
# you can temporarily include this class definition in a separate file
# and ensure it's loaded as a singleton.
#
# Example 'memory_manager.gd' content:
# extends Node
# signal memory_lost(memory_id: String)
# func lose_memory(id: String):
# 	print("Memory lost: ", id)
# 	memory_lost.emit(id)
