extends Node2D

# Script to trigger multiple errors for testing error parser

var my_null_node: Node = null
var my_array: Array = []

func _ready() -> void:
	print("Starting multiple error test...")

	# Historical error-parser fixture calls are kept opt-in so the editor
	# language server can parse this project without reporting live errors.
	if false:
		trigger_null_error()
		trigger_index_error()
		trigger_missing_function()

func trigger_null_error() -> void:
	# This will trigger a null reference error
	my_null_node.get_name()  # ERROR: Cannot call method on null

func trigger_index_error() -> void:
	# This will trigger an index out of bounds error
	var value = my_array[10]  # ERROR: Index out of bounds

func trigger_missing_function() -> void:
	# This will trigger a function not found error
	push_error("Intentional missing function fixture is disabled")
