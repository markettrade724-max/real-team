# mnemonic_temporal_resonance.gd
@tool
extends Area3D

## TimeDistortionZone: Applies localized time distortion to entering objects.
## Objects must have a 'set_time_distortion_factor(factor: float, speed: float)' method.

@export_group("Time Distortion Settings")
@export var time_scale_factor: float = 0.5: # Scale factor for time (e.g., 0.5 for half speed, 2.0 for double speed)
	set(value):
		time_scale_factor = clamp(value, 0.01, 10.0) # Prevent division by zero or extreme values
@export var transition_speed: float = 5.0 # Speed at which objects adapt to the new time scale

func _ready() -> void:
	# Connect signals for body entry/exit
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node3D) -> void:
	# Attempt to apply time distortion to the entering body
	if body.has_method("set_time_distortion_factor"):
		body.set_time_distortion_factor(time_scale_factor, transition_speed)

func _on_body_exited(body: Node3D) -> void:
	# Revert time distortion for the exiting body
	if body.has_method("set_time_distortion_factor"):
		body.set_time_distortion_factor(1.0, transition_speed) # Revert to normal time (factor 1.0)
