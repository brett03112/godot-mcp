extends Node

var ref_a = preload("res://tier1_refactor_a.gd")

func _ready():
	var dmg = compute_damage(10)
	health_changed.emit(50)
	print(MAXIMUM_HEALTH)
