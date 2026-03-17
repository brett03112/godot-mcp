extends Area2D
class_name MockCoin
## Auto-generated mock for Area2D

## Call tracking — each entry is { "method": String, "args": Array }
var _calls: Array[Dictionary] = []

## Override return values at runtime: _return_values["method_name"] = value
var _return_values: Dictionary = {}

func collect():
	_calls.append({"method": "collect", "args": []})
	if _return_values.has("collect"):
		return _return_values["collect"]
	return null

func _on_body_entered(body):
	_calls.append({"method": "_on_body_entered", "args": [body]})
	if _return_values.has("_on_body_entered"):
		return _return_values["_on_body_entered"]
	return null

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
