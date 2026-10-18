extends Node3D

@export_range(0.0, 1.0) var identity_coherence: float = 1.0	# 1.0 = coherent, 0.0 = dissolving
@export_range(0.0, 1.0) var silence_proximity: float = 0.0	# 0.0 = far, 1.0 = close

@export var terrain_size: int = 64			# Number of cells along one axis
@export var cell_size: float = 2.0			# Size of each cell in world units
@export var height_scale: float = 10.0		# Max height variation
@export var detail_frequency: float = 0.1	# How often height changes

var mesh_instance: MeshInstance3D
var navigation_region: NavigationRegion3D
var current_mesh: ArrayMesh
var noise_generator: FastNoiseLite

func _ready() -> void:
	_setup_nodes()
	_generate_terrain()

func _setup_nodes() -> void:
	mesh_instance = MeshInstance3D.new()
	add_child(mesh_instance)
	mesh_instance.owner = self
	mesh_instance.name = "ProceduralTerrainMesh"

	navigation_region = NavigationRegion3D.new()
	add_child(navigation_region)
	navigation_region.owner = self
	navigation_region.name = "TerrainNavigationRegion"
	navigation_region.navigation_mesh_source_geometry_mode = NavigationRegion3D.SOURCE_GEOMETRY_GROUPS_WITH_CHILDREN
	navigation_region.navigation_mesh_source_group_name = "navmesh_source"

	mesh_instance.add_to_group("navmesh_source")

	var material = StandardMaterial3D.new()
	material.albedo_color = Color(0.3, 0.5, 0.7)
	mesh_instance.material_override = material

	noise_generator = FastNoiseLite.new()
	noise_generator.seed = 12345	# Consistent seed for reproducibility
	noise_generator.frequency = detail_frequency

func _generate_terrain() -> void:
	current_mesh = ArrayMesh.new()
	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for x in range(terrain_size):
		for z in range(terrain_size):
			var h1 = _get_cell_height(x, z)
			var h2 = _get_cell_height(x + 1, z)
			var h3 = _get_cell_height(x, z + 1)
			var h4 = _get_cell_height(x + 1, z + 1)

			var p1 = Vector3(x * cell_size, h1, z * cell_size)
			var p2 = Vector3((x + 1) * cell_size, h2, z * cell_size)
			var p3 = Vector3(x * cell_size, h3, (z + 1) * cell_size)
			var p4 = Vector3((x + 1) * cell_size, h4, (z + 1) * cell_size)

			# First triangle (p1, p3, p2)
			st.add_vertex(p1)
			st.add_vertex(p3)
			st.add_vertex(p2)

			# Second triangle (p2, p3, p4)
			st.add_vertex(p2)
			st.add_vertex(p3)
			st.add_vertex(p4)

	st.generate_normals()
	st.commit(current_mesh)
	mesh_instance.mesh = current_mesh

	_update_navigation_mesh()

func _get_cell_height(x: int, z: int) -> float:
	var base_height = 0.0

	var identity_factor = (1.0 - identity_coherence) * height_scale
	var silence_factor = silence_proximity * height_scale

	var height = noise_generator.get_noise_2d(float(x), float(z)) * height_scale * 0.5

	# Introduce "gaps" if identity is low
	if noise_generator.get_noise_2d(float(x) * 2.0, float(z) * 2.0) < -0.5 * (1.0 - identity_coherence):
		height -= identity_factor * 2.0

	# Introduce "spikes" if silence is high
	if noise_generator.get_noise_2d(float(x) * 3.0, float(z) * 3.0) > 0.7 * silence_proximity:
		height += silence_factor * 3.0

	return base_height + height

func _update_navigation_mesh() -> void:
	# Trigger baking of the navigation mesh from the children in the "navmesh_source" group.
	# Setting `true` for `async` bake is good for performance.
	navigation_region.bake_navigation_mesh(true)

func regenerate_terrain() -> void:
	_generate_terrain()
