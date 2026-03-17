class_name Coin
extends Area2D

@export var points: int = 10
@export var spin_speed: float = 2.0

signal collected(points: int)

## Called when ready occurs.
func _ready() -> void:
	body_entered.connect(_on_body_entered)

## Called when process occurs.
##
## @param delta [float] —
func _process(delta: float) -> void:
	# Add a visual spin effect
	rotation += spin_speed * delta

## Called when on_body_entered occurs.
##
## @param body [Node2D] —
func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		collect()

## Collect.
func collect() -> void:
	collected.emit(points)
	queue_free()
