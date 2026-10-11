@tool
class_name MemoryRealitySuture extends Node3D

signal memory_fragment_consumed
signal temporal_echo_generated(position: Vector3, intensity: float)

# How long the sutured reality persists (in seconds)
@export var suture_duration: float = 5.0
# Visual material for the temporary sutured objects
@export var suture_material: StandardMaterial3D
# Visual mesh for the temporary sutured objects (e.g., QuadMesh, BoxMesh)
@export var suture_mesh: Mesh

var _snapshots: Dictionary = {} # Stores snapshots by NodePath

func _ready() -> void:
	if suture_material == null:
		suture_material = StandardMaterial3D.new()
		suture_material.albedo_color = Color(0.2, 0.8, 0.8, 0.5) # Cyan, semi-transparent
		suture_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if suture_mesh == null:
		suture_mesh = BoxMesh.new()
		(suture_mesh as BoxMesh).size = Vector3(1, 0.1, 1) # Default small platform

func capture_snapshot(body: PhysicsBody3D) -> void:
	if not is_instance_valid(body):
		return

	var snapshot_key: NodePath = body.get_path()
	var collision_shape_data: Array = []

	for child in body.get_children():
		if child is CollisionShape3D:
			var cs: CollisionShape3D = child
			if cs.shape:
				collision_shape_data.append({
					"shape": cs.shape,
					"transform": cs.transform
				})

	_snapshots[snapshot_key] = {
		"transform": body.global_transform,
		"collision_shapes": collision_shape_data
	}
	print("Snapshot captured for: %s" % snapshot_key)

func project_suture(target_body_path: NodePath) -> bool:
	if not _snapshots.has(target_body_path):
		print("No snapshot found for: %s" % target_body_path)
		return false

	# Signal to Lyra's controller to consume a memory fragment
	emit_signal("memory_fragment_consumed")

	var snapshot_data: Dictionary = _snapshots[target_body_path]
	var temp_suture_body := StaticBody3D.new()
	temp_suture_body.global_transform = snapshot_data["transform"]
	add_child(temp_suture_body)

	# Add visual mesh
	if suture_mesh:
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.mesh = suture_mesh
		mesh_instance.material_override = suture_material
		temp_suture_body.add_child(mesh_instance)

	# Add collision shapes
	for cs_data in snapshot_data["collision_shapes"]:
		var temp_collision_shape := CollisionShape3D.new()
		temp_collision_shape.shape = cs_data["shape"]
		temp_collision_shape.transform = cs_data["transform"]
		temp_suture_body.add_child(temp_collision_shape)

	# Setup a timer to despawn the sutured object
	var despawn_timer := Timer.new()
	despawn_timer.wait_time = suture_duration
	despawn_timer.one_shot = true
	despawn_timer.timeout.connect(Callable(temp_suture_body, "queue_free"))
	add_child(despawn_timer)
	despawn_timer.start()

	# Generate temporal echo for the Silence
	emit_signal("temporal_echo_generated", temp_suture_body.global_transform.origin, 1.0)
	print("Suture projected at: %s" % temp_suture_body.global_transform.origin)
	return true

func clear_snapshot(target_body_path: NodePath) -> void:
	if _snapshots.has(target_body_path):
		_snapshots.erase(target_body_path)
		print("Snapshot cleared for: %s" % target_body_path)
