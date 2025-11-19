extends Node2D

enum State {
	IDLE,
	MOVING,
	ATTACKING,
}

signal state_changed(old_state: State, new_state: State)

var current_state: State = State.IDLE

func _ready() -> void:
	change_state(State.IDLE)

func _process(delta: float) -> void:
	match current_state:
		State.IDLE:
			process_idle(delta)
		State.MOVING:
			process_moving(delta)
		State.ATTACKING:
			process_attacking(delta)

func change_state(new_state: State) -> void:
	if current_state == new_state:
		return
	var old_state = current_state
	exit_state(old_state)
	current_state = new_state
	enter_state(new_state)
	state_changed.emit(old_state, new_state)

func enter_state(state: State) -> void:
	match state:
		State.IDLE:
			pass
		State.MOVING:
			pass
		State.ATTACKING:
			pass

func exit_state(state: State) -> void:
	match state:
		State.IDLE:
			pass
		State.MOVING:
			pass
		State.ATTACKING:
			pass

func process_idle(delta: float) -> void:
	pass

func process_moving(delta: float) -> void:
	pass

func process_attacking(delta: float) -> void:
	pass
