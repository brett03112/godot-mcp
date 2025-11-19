extends Node

# Modular component pattern
# Attach to a node to add specific functionality

@export var enabled: bool = true
@export var debug_mode: bool = false

var owner_node: Node

func _ready() -> void:
	owner_node = get_parent()
	if debug_mode:
		print("Component initialized on: ", owner_node.name)

func _process(delta: float) -> void:
	if not enabled:
		return
	update_component(delta)

func update_component(delta: float) -> void:
	# Override in derived components
	pass

func enable() -> void:
	enabled = true

func disable() -> void:
	enabled = false

func toggle() -> void:
	enabled = not enabled
