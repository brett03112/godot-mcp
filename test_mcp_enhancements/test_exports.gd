extends Node

@export var speed: float = 100.0
@export_range(0, 200, 10) var health: int = 100
@export_file("*.json") var config_file: String = ""
@export_enum("Easy", "Medium", "Hard") var difficulty: int = 1
@export_dir var data_folder: String = "res://data"
# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass
