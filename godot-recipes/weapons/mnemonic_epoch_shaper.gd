@tool
extends MeshInstance3D

class MemoryFragment:
	var id: String
	var integrity: float = 1.0
	var vertices: PackedVector3Array
	var indices: PackedInt32Array
	var normals: PackedVector3Array
	var uvs: PackedVector2Array
	var colors: PackedColorArray # To pass integrity info to shader

	func _init(p_id: String, p_vertices: PackedVector3Array, p_indices: PackedInt32Array, p_normals: PackedVector3Array, p_uvs: PackedVector2Array):
		id = p_id
		vertices = p_vertices
		indices = p_indices
		normals = p_normals
		uvs = p_uvs
		colors = PackedColorArray([Color(1,1,1,1)] * vertices.size()) # Default to full integrity

var _active_memories: Array[MemoryFragment] = []
var _particles_node: GPUParticles3D
var _shader_material: ShaderMaterial

func _ready():
	if Engine.is_editor_hint(): return

	_particles_node = GPUParticles3D.new()
	add_child(_particles_node)
	_particles_node.process_material = ParticleProcessMaterial.new()
	_particles_node.process_material.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	_particles_node.process_material.emission_sphere_radius = 0.1
	_particles_node.process_material.direction = Vector3(0,1,0)
	_particles_node.process_material.spread = 180.0
	_particles_node.process_material.initial_velocity_min = 1.0
	_particles_node.process_material.initial_velocity_max = 2.0
	_particles_node.process_material.lifetime_randomness = 0.5
	_particles_node.process_material.lifetime_min = 0.5
	_particles_node.process_material.lifetime_max = 1.0
	_particles_node.amount = 32
	_particles_node.one_shot = true
	_particles_node.explosiveness = 1.0
	_particles_node.emitting = false

	var particle_texture = GradientTexture2D.new()
	var gradient = Gradient.new()
	gradient.add_point(0.0, Color(1.0, 0.2, 0.1, 1.0)) # Start red
	gradient.add_point(1.0, Color(0.5, 0.1, 0.05, 0.0)) # End faded
	particle_texture.gradient = gradient
	_particles_node.texture = particle_texture

	_shader_material = ShaderMaterial.new()
	material_override = _shader_material
	_shader_material.shader = preload("res://epoch_shaper_shader.gdshader") # Assuming shader file exists

func add_memory_fragment(fragment: MemoryFragment):
	_active_memories.append(fragment)
	_rebuild_mesh()

func erode_memory(memory_id: String, amount: float):
	var memory_to_erode: MemoryFragment = null
	var memory_index = -1
	for i, mem in _active_memories:
		if mem.id == memory_id:
			memory_to_erode = mem
			memory_index = i
			break

	if memory_to_erode:
		memory_to_erode.integrity = max(0.0, memory_to_erode.integrity - amount)
		_update_memory_colors(memory_to_erode) # Update vertex colors for shader
		if memory_to_erode.integrity <= 0.0:
			_active_memories.remove_at(memory_index)
			_trigger_erosion_particles(global_transform.origin) # Simplified particle origin
			_rebuild_mesh()
		else:
			_rebuild_mesh() # Rebuild to update vertex colors

func _update_memory_colors(fragment: MemoryFragment):
	var new_color = Color(1.0, fragment.integrity, fragment.integrity, fragment.integrity) # R for full, G/B for decay
	for i in range(fragment.colors.size()):
		fragment.colors[i] = new_color

func _rebuild_mesh():
	var new_mesh = ArrayMesh.new()
	var combined_vertices: PackedVector3Array = []
	var combined_indices: PackedInt32Array = []
	var combined_normals: PackedVector3Array = []
	var combined_uvs: PackedVector2Array = []
	var combined_colors: PackedColorArray = []
	var current_index_offset = 0

	for mem in _active_memories:
		for v in mem.vertices:
			combined_vertices.append(v)
		for n in mem.normals:
			combined_normals.append(n)
		for u in mem.uvs:
			combined_uvs.append(u)
		for c in mem.colors:
			combined_colors.append(c)
		for idx in mem.indices:
			combined_indices.append(idx + current_index_offset)
		current_index_offset += mem.vertices.size()

	if combined_vertices.is_empty():
		mesh = null
		return

	var arrays = []
	arrays.resize(ArrayMesh.ARRAY_MAX)
	arrays[ArrayMesh.ARRAY_VERTEX] = combined_vertices
	arrays[ArrayMesh.ARRAY_NORMAL] = combined_normals
	arrays[ArrayMesh.ARRAY_TEX_UV] = combined_uvs
	arrays[ArrayMesh.ARRAY_COLOR] = combined_colors # Pass colors to shader
	arrays[ArrayMesh.ARRAY_INDEX] = combined_indices

	new_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh = new_mesh

func _trigger_erosion_particles(position: Vector3):
	_particles_node.global_transform.origin = position
	_particles_node.restart()
