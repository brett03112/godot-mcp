class_name TestPlayer
extends CharacterBody2D

signal hp_changed(new_health: int)
signal died

const MAXIMUM_HEALTH = 100
const SPEED = 200.0

@export var jump_force: float = -400.0
@export_range(0, 100) var starting_health: int = 100

var current_health: int = starting_health

func _ready() -> void:
    hp_changed.emit(current_health)

func take_damage(amount: int) -> void:
    current_health -= amount
    hp_changed.emit(current_health)
    if current_health <= 0:
        die()

func die() -> void:
    died.emit()
    queue_free()
