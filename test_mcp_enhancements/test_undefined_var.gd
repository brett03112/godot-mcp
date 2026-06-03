extends Node2D

# Script with undefined variable usage

func _ready() -> void:
	print("Testing undefined variable")
	var defined_value := "fixture value"
	var another_defined := "another fixture value"
	print("Value: ", defined_value)
	print("Another: ", another_defined)
