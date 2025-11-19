extends Node2D

# Valid GDScript file for testing validation

@export var speed: float = 100.0
@export var health: int = 100

func _ready() -> void:
	print("Script is valid!")
	print("Speed: ", speed)
	print("Health: ", health)

func _process(delta: float) -> void:
	# Process logic here
	pass

func take_damage(amount: int) -> void:
	health -= amount
	if health <= 0:
		die()

func die() -> void:
	print("Game over")
	queue_free()
