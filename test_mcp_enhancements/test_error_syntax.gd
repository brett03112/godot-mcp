extends Node2D

# Script with intentional syntax errors for testing error parser

func _ready() -> void
	# Missing colon at end of function declaration (line 5)
	print("This will cause a parse error")

func test_function() -> void:
	# Missing colon after if statement (line 11)
	if true
		print("Missing colon")

	# Invalid indentation (line 15)
print("Wrong indentation")
