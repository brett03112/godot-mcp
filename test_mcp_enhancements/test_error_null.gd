extends Node2D

# Script to intentionally trigger a null reference error for testing error parser

var my_node: Node = null

func _ready() -> void:
	print("Starting error test...")
	# This will trigger a null reference error
	trigger_null_error()

func trigger_null_error() -> void:
	# Attempting to access a method on a null object
	my_node.queue_free()  # ERROR: Attempt to call function 'queue_free' in base 'null instance' on a null instance
