extends Node2D

# Script to trigger multiple errors for testing error parser

var my_null_node: Node = null
var my_array: Array = []

func _ready() -> void:
	print("Starting multiple error test...")

	# Error 1: Null reference error
	trigger_null_error()

	# Error 2: Array index out of bounds
	trigger_index_error()

	# Error 3: Call non-existent function
	trigger_missing_function()

func trigger_null_error() -> void:
	# This will trigger a null reference error
	my_null_node.get_name()  # ERROR: Cannot call method on null

func trigger_index_error() -> void:
	# This will trigger an index out of bounds error
	var value = my_array[10]  # ERROR: Index out of bounds

func trigger_missing_function() -> void:
	# This will trigger a function not found error
	self.nonexistent_function()  # ERROR: Function not found
