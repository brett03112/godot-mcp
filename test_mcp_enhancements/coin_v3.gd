class_name CoinV3
extends Area2D

@export var points: int = 10
@export var spin_speed: float = 2.0

signal collected(points: int)

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	# Add a visual spin effect
	rotation += spin_speed * delta

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		collect()

func collect() -> void:
	collected.emit(points)
	queue_free()
