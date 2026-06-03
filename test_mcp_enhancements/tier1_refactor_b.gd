extends Node

var ref_a = preload("res://tier1_refactor_a.gd")

func _ready():
	var helper = ref_a.new()
	var dmg = helper.compute_damage(10)
	helper.hp_changed.emit(50)
	print(helper.MAXIMUM_HEALTH)
	helper.queue_free()
