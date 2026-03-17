extends Node
class_name MockBare
## Auto-generated mock for Node

## Call tracking — each entry is { "method": String, "args": Array }
var _calls: Array[Dictionary] = []

## Override return values at runtime: _return_values["method_name"] = value
var _return_values: Dictionary = {}

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
