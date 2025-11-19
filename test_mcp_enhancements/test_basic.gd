class_name TestBasic
extends Node

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	var time = Time.get_ticks_msec() / 1000.0
	if int(time) % 5 == 0:
		print("5 seconds elapsed")
