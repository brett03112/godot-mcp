extends Node2D

signal hp_changed(new_health: int)

var player_speed: float = 200.0

const MAXIMUM_HEALTH = 100

func compute_damage(amount: int) -> int:
	return amount * 2

func _on_health_changed(val):
	player_speed = val
