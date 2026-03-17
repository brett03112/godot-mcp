/**
 * Playtest Bot GDScript Generator (Tier 4 — Phase A)
 *
 * Generates the mcp_playtest_bot.gd autoload script that simulates
 * player input during automated playtests.
 *
 * Bot types:
 * - random: Randomly presses mapped input actions at random intervals
 * - waypoint: Moves toward random positions using movement actions
 * - idle: No input (observe only)
 * - stress: All actions simultaneously, rapid toggling
 */

export type BotType = 'random' | 'waypoint' | 'idle' | 'stress';

export interface BotConfig {
  botType: BotType;
}

/**
 * Generate the playtest bot GDScript autoload
 */
export function generateBotScript(config: BotConfig): string {
  switch (config.botType) {
    case 'idle':
      return generateIdleBot();
    case 'random':
      return generateRandomBot();
    case 'waypoint':
      return generateWaypointBot();
    case 'stress':
      return generateStressBot();
    default:
      return generateIdleBot();
  }
}

function generateIdleBot(): string {
  return `extends Node
# MCP Playtest Bot (idle) — auto-generated, do not edit
# Does nothing — game runs with no input for observation

func _ready() -> void:
\tprint("[MCP Bot] Idle bot active — no input will be generated")
`;
}

function generateRandomBot(): string {
  return `extends Node
# MCP Playtest Bot (random) — auto-generated, do not edit
# Randomly presses and releases mapped input actions

var _actions := []
var _action_timers := {}
var _rng := RandomNumberGenerator.new()

func _ready() -> void:
\t_rng.randomize()
\t# Collect all non-UI input actions
\tfor action in InputMap.get_actions():
\t\tif action.begins_with("ui_"):
\t\t\tcontinue
\t\t_actions.append(action)
\t\t_action_timers[action] = _rng.randf_range(0.1, 1.5)
\tprint("[MCP Bot] Random bot active with ", _actions.size(), " actions: ", _actions)

func _process(delta: float) -> void:
\tfor action in _actions:
\t\t_action_timers[action] -= delta
\t\tif _action_timers[action] <= 0.0:
\t\t\t# Toggle the action
\t\t\tvar is_pressed := Input.is_action_pressed(action)
\t\t\tvar event := InputEventAction.new()
\t\t\tevent.action = action
\t\t\tevent.pressed = not is_pressed
\t\t\tInput.parse_input_event(event)
\t\t\t# Random delay before next toggle
\t\t\t_action_timers[action] = _rng.randf_range(0.05, 2.0)
`;
}

function generateWaypointBot(): string {
  return `extends Node
# MCP Playtest Bot (waypoint) — auto-generated, do not edit
# Moves toward random positions using movement input actions

var _rng := RandomNumberGenerator.new()
var _target := Vector2.ZERO
var _timer := 0.0
var _change_interval := 2.0
var _move_actions := {}

func _ready() -> void:
\t_rng.randomize()
\t# Detect common movement actions
\tvar action_map := {
\t\t"move_left": Vector2.LEFT,
\t\t"move_right": Vector2.RIGHT,
\t\t"move_up": Vector2.UP,
\t\t"move_down": Vector2.DOWN,
\t\t"left": Vector2.LEFT,
\t\t"right": Vector2.RIGHT,
\t\t"up": Vector2.UP,
\t\t"down": Vector2.DOWN,
\t}
\tfor action in InputMap.get_actions():
\t\tif action in action_map:
\t\t\t_move_actions[action] = action_map[action]
\t_pick_new_target()
\tprint("[MCP Bot] Waypoint bot active with move actions: ", _move_actions.keys())

func _process(delta: float) -> void:
\t_timer += delta
\tif _timer >= _change_interval:
\t\t_timer = 0.0
\t\t_pick_new_target()

\t# Press movement actions toward target
\tfor action in _move_actions:
\t\tvar dir: Vector2 = _move_actions[action]
\t\tvar should_press := false
\t\tif dir.x < 0 and _target.x < 0:
\t\t\tshould_press = true
\t\telif dir.x > 0 and _target.x > 0:
\t\t\tshould_press = true
\t\tif dir.y < 0 and _target.y < 0:
\t\t\tshould_press = true
\t\telif dir.y > 0 and _target.y > 0:
\t\t\tshould_press = true

\t\tvar currently_pressed := Input.is_action_pressed(action)
\t\tif should_press != currently_pressed:
\t\t\tvar event := InputEventAction.new()
\t\t\tevent.action = action
\t\t\tevent.pressed = should_press
\t\t\tInput.parse_input_event(event)

\t# Occasionally jump if action exists
\tif _rng.randf() < 0.02:
\t\tfor jump_action in ["jump", "ui_accept"]:
\t\t\tif InputMap.has_action(jump_action):
\t\t\t\tvar event := InputEventAction.new()
\t\t\t\tevent.action = jump_action
\t\t\t\tevent.pressed = true
\t\t\t\tInput.parse_input_event(event)
\t\t\t\t# Release next frame
\t\t\t\tawait get_tree().process_frame
\t\t\t\tevent = InputEventAction.new()
\t\t\t\tevent.action = jump_action
\t\t\t\tevent.pressed = false
\t\t\t\tInput.parse_input_event(event)
\t\t\t\tbreak

func _pick_new_target() -> void:
\t_target = Vector2(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1)).normalized()
\t_change_interval = _rng.randf_range(0.5, 4.0)
`;
}

function generateStressBot(): string {
  return `extends Node
# MCP Playtest Bot (stress) — auto-generated, do not edit
# Rapidly toggles ALL actions for stress testing

var _actions := []
var _rng := RandomNumberGenerator.new()
var _frame_counter := 0

func _ready() -> void:
\t_rng.randomize()
\tfor action in InputMap.get_actions():
\t\tif action.begins_with("ui_"):
\t\t\tcontinue
\t\t_actions.append(action)
\tprint("[MCP Bot] Stress bot active — rapidly toggling ", _actions.size(), " actions")

func _process(_delta: float) -> void:
\t_frame_counter += 1
\t# Toggle a random subset of actions every frame
\tvar count := _rng.randi_range(1, max(1, _actions.size()))
\tfor i in count:
\t\tvar action: String = _actions[_rng.randi() % _actions.size()]
\t\tvar event := InputEventAction.new()
\t\tevent.action = action
\t\tevent.pressed = _rng.randf() > 0.4  # Bias toward pressed
\t\tInput.parse_input_event(event)
`;
}
