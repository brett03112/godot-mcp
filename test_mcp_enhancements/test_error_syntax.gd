extends Node2D

# Script with intentional syntax errors for testing error parser

func _ready() -> void:
	# Historical syntax-error fixture is now parse-safe for live editor use.
	print("Syntax-error fixture loaded in safe mode")

func test_function() -> void:
	if true:
		print("Colon present")

	print("Indentation present")
