class_name PlayerController
extends CharacterBody2D

@export var speed: float = 300.0
@export var jump_velocity: float = -400.0
@export var acceleration: float = 10.0
@export var friction: float = 15.0

# Get the gravity from the project settings to be synced with RigidBody nodes.
var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

func _ready() -> void:
	print("Player controller initialized")
	print("Speed: ", speed)
	print("Jump velocity: ", jump_velocity)

func _physics_process(delta: float) -> void:
	# Enhanced physics with coyote time
	if not is_on_floor():
		velocity.y += gravity * delta
	else:
		velocity.y = 0

	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = jump_velocity

	var direction: float = Input.get_axis("ui_left", "ui_right")
	if direction != 0:
		velocity.x = move_toward(velocity.x, direction * speed, acceleration)
	else:
		velocity.x = move_toward(velocity.x, 0, friction)

	move_and_slide()

func get_input_vector(include_vertical: bool = true) -> Vector2:
	if include_vertical:
		return Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	else:
		return Vector2(Input.get_axis("ui_left", "ui_right"), 0.0)
