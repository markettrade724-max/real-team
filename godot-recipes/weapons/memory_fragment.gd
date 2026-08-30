class_name MemoryFragment extends Resource

@export_category("Memory Fragment Data")
@export var fragment_name: String = "Unnamed Memory"
@export var texture: Texture2D # Visual representation
@export var narrative_tag: String = "Generic" # e.g., "Childhood Joy", "Agility"
@export var power_value: float = 1.0 # Base power contribution
@export var debuff_effect: String = "" # e.g., "reduce_speed", "reduce_jump"
@export var debuff_duration: float = 3.0 # How long the debuff lasts