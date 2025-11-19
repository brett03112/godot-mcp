extends Node

@export_file("*.json") var config_file: String = ""
@export_enum("Easy", "Medium", "Hard") var difficulty: int = 1
@export_flags("Read", "Write", "Execute") var permissions: int = 0
# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass
