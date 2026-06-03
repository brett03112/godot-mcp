extends Area2D
class_name MockCoinFull
## Auto-generated mock for Area2D

signal collected(points: int)

## Call tracking — each entry is { "method": String, "args": Array }
var _calls: Array[Dictionary] = []

## Override return values at runtime: _return_values["method_name"] = value
var _return_values: Dictionary = {}

## Signal emission tracking
var _emitted_signals: Array[Dictionary] = []

func _ready() -> void:
	collected.connect(_on_signal_emitted.bind("collected"))
	body_entered.connect(_on_signal_emitted.bind("body_entered"))

func _on_signal_emitted(_payload: Variant = null, signal_name: String = "") -> void:
	_emitted_signals.append({"signal": signal_name, "time": Time.get_ticks_msec()})

func collect():
	_calls.append({"method": "collect", "args": []})
	if _return_values.has("collect"):
		return _return_values["collect"]
	return null

func is_collectable():
	_calls.append({"method": "is_collectable", "args": []})
	if _return_values.has("is_collectable"):
		return _return_values["is_collectable"]
	return true

# ─── Assertion Helpers ─────────────────────────────────────────────────

## Returns true if the method was called at least once
func assert_called(method_name: String) -> bool:
	for call in _calls:
		if call["method"] == method_name:
			return true
	return false

## Returns true if the method was called with the given arguments
func assert_called_with(method_name: String, expected_args: Array) -> bool:
	for call in _calls:
		if call["method"] == method_name and call["args"] == expected_args:
			return true
	return false

## Returns the number of times a method was called
func call_count(method_name: String) -> int:
	var count := 0
	for call in _calls:
		if call["method"] == method_name:
			count += 1
	return count

## Returns all arguments from all calls to a method
func get_calls(method_name: String) -> Array:
	var result := []
	for call in _calls:
		if call["method"] == method_name:
			result.append(call["args"])
	return result

## Reset all call tracking
func reset_mock() -> void:
	_calls.clear()
	_emitted_signals.clear()
