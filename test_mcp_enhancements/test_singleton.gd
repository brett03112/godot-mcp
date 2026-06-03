class_name GameManager
extends Node

# Singleton instance (accessed via autoload)
# Add this script to Project Settings -> Autoload

signal value_changed(new_value)

var data: Dictionary = {}

func _ready() -> void:
	log_info("Singleton initialized")

func set_value(key: String, value) -> void:
	data[key] = value
	value_changed.emit(value)

func get_value(key: String, default = null):
	return data.get(key, default)

func has_value(key: String) -> bool:
	return data.has(key)

func clear_data() -> void:
	data.clear()

static func spawn_entity(_entity: Variant) -> void:
	pass

func log_info(message: String) -> void:
	print("[" + name + "] " + message)
