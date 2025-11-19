extends Node2D
class_name TestCustomSignals

## Custom signal with no parameters
signal health_changed

## Custom signal with one parameter
signal player_died(player_name: String)

## Custom signal with multiple parameters
signal damage_taken(amount: int, damage_type: String, is_critical: bool)

## Custom signal with complex types
signal item_collected(item: Node, position: Vector2)

func _ready():
	pass
