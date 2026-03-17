extends Node2D

const Enemy = preload("res://enemy.gd")

signal custom_signal(param1: int, param2: String, param3: bool)

enum State {
	IDLE,
	RUNNING,
	JUMPING
}

## Complex Function.
##
## @param arg1 [int] —
## @param arg2 [String] —
## @param arg3 [Array] —
## @param arg4 [Dictionary] —
## @return [Dictionary]
func complex_function(arg1: int, arg2: String, arg3: Array[int], arg4: Dictionary) -> Dictionary:
	return {}

func multiline_function(
	very_long_parameter_name_1: int,
	very_long_parameter_name_2: String
) -> void:
	pass

func _on_button_pressed():
	print("Button pressed")
