extends CharacterBody2D

signal died
signal damage_taken(amount: int)

@export var speed: float = 300.0
@export var jump_velocity: float = -400.0

var health: int = 100
var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y += gravity * delta

	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = jump_velocity

	var direction: float = Input.get_axis("ui_left", "ui_right")
	if direction != 0:
		velocity.x = move_toward(velocity.x, direction * speed, 25.0)
	else:
		velocity.x = move_toward(velocity.x, 0, 15.0)

	move_and_slide()

func take_damage(amount: int) -> void:
	health -= amount
	damage_taken.emit(amount)
	if health <= 0:
		died.emit()
		queue_free()
