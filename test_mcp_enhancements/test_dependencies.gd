class_name TestDependencies
extends Node

# Preload dependencies
const PlayerScene = preload("res://scenes/player.tscn")
const EnemyScript = preload("res://scripts/enemy.gd")
const ICON = preload("res://icon.svg")

# Regular variables with resource paths
var config_path: String = "res://config/settings.json"
var user_data_path: String = "user://save_data.dat"

# Preload in variable
var weapon_scene = preload("res://scenes/weapon.tscn")

func _ready() -> void:
	# Load statement
	var dynamic_scene = load("res://scenes/dynamic_level.tscn")

	# Class references
	var player = PlayerController.new()
	var inventory = InventorySystem.get_instance()

	# Resource path in function call
	var texture = load("res://textures/sprite.png")
	ResourceLoader.load("res://resources/material.tres")

func spawn_enemy(enemy_type: String) -> void:
	var enemy_scene_path = "res://enemies/" + enemy_type + ".tscn"
	var enemy = load(enemy_scene_path)

	# Another class reference
	GameManager.spawn_entity(enemy)
