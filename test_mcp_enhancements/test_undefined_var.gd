extends Node2D

# Script with undefined variable usage

func _ready() -> void:
	print("Testing undefined variable")
	# Using a variable that was never declared
	print("Value: ", undefined_variable)
	print("Another: ", another_undefined)
