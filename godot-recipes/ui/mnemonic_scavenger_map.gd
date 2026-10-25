	@tool
	extends TextureRect

	@export_file("*.gdshader") var shader_path: String = "res://mnemonic_scavenger_map.gdshader"
	@export var degradation_amount: float = 0.0: # 0.0 (no degradation) to 1.0 (full degradation)
		set(value):
			degradation_amount = clampf(value, 0.0, 1.0)
			_update_shader_parameters()
	@export var degradation_origin: Vector2 = Vector2(0.5, 0.5): # UV coordinates (0,0) to (1,1)
		set(value):
			degradation_origin = value
			_update_shader_parameters()
	@export var degradation_speed: float = 0.1 # How fast degradation_amount increases per second (if not controlled externally)

	var _shader_material: ShaderMaterial
	var _viewport_container: ViewportContainer
	var _map_viewport: Viewport

	func _ready() -> void:
		_setup_shader_material()
		_setup_map_viewport()
		_update_shader_parameters()

	func _process(delta: float) -> void:
		# The degradation_amount is typically controlled externally by game logic
		# For a continuous auto-degradation, uncomment the line below:
		# degradation_amount += degradation_speed * delta
		# _update_shader_parameters()
		pass

	func _setup_shader_material() -> void:
		if not shader_path.is_empty() and FileAccess.file_exists(shader_path):
			var shader_resource = load(shader_path)
			if shader_resource is Shader:
				_shader_material = ShaderMaterial.new()
				_shader_material.shader = shader_resource
				material = _shader_material
			else:
				push_error("Failed to load shader resource at: ", shader_path)
		else:
			push_error("Shader path is empty or file does not exist: ", shader_path)

	func _setup_map_viewport() -> void:
		# Find or create ViewportContainer and Viewport
		_viewport_container = get_node_or_null("ViewportContainer")
		if not _viewport_container:
			_viewport_container = ViewportContainer.new()
			_viewport_container.name = "ViewportContainer"
			_viewport_container.stretch = true
			add_child(_viewport_container)
			if get_owner():
				_viewport_container.owner = get_owner() # Ensure it's saved with the scene

		_map_viewport = _viewport_container.get_node_or_null("MapViewport")
		if not _map_viewport:
			_map_viewport = Viewport.new()
			_map_viewport.name = "MapViewport"
			_map_viewport.size = size # Match parent TextureRect size
			_map_viewport.transparent_bg = true
			_map_viewport.disable_3d = false # Set to true if only 2D map content
			_viewport_container.add_child(_map_viewport)
			if get_owner():
				_map_viewport.owner = get_owner()

		# Set the TextureRect's texture to the ViewportTexture
		texture = _map_viewport.get_texture()

	func _update_shader_parameters() -> void:
		if _shader_material:
			_shader_material.set_shader_parameter("degradation_amount", degradation_amount)
			_shader_material.set_shader_parameter("degradation_origin", degradation_origin)
			_shader_material.set_shader_parameter("time", Time.get_ticks_msec() / 1000.0)

	# Optional: Update viewport size if TextureRect size changes
	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED:
			if _map_viewport:
				_map_viewport.size = size

	func get_map_viewport() -> Viewport:
		return _map_viewport