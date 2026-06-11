#!/usr/bin/env -S godot --headless --script
extends SceneTree

const OperationContext = preload("godot_ops/operation_context.gd")
const OperationRegistry = preload("godot_ops/operation_registry.gd")

func _init() -> void:
	var args := OS.get_cmdline_args()
	var debug_mode := "--debug-godot" in args
	var context = OperationContext.new(debug_mode)

	var script_index := args.find("--script")
	if script_index == -1:
		context.log_error("Could not find --script argument")
		quit(1)
		return

	var operation_index := script_index + 2
	var params_index := script_index + 3
	if args.size() <= params_index:
		context.log_error(
			"Usage: godot --headless --script godot_operations.gd <operation> <json_params>")
		context.log_error("Not enough command-line arguments provided.")
		quit(1)
		return

	context.log_debug("All arguments: " + str(args))
	context.log_debug("Script index: " + str(script_index))
	context.log_debug("Operation index: " + str(operation_index))
	context.log_debug("Params index: " + str(params_index))

	var operation := str(args[operation_index])
	var params_json := str(args[params_index])
	context.log_info("Operation: " + operation)
	context.log_debug("Params JSON: " + params_json)

	var parsed_params = context.parse_json_params(params_json)
	if typeof(parsed_params) != TYPE_DICTIONARY:
		quit(1)
		return

	var registry = OperationRegistry.new(context)
	var success := registry.dispatch(operation, parsed_params)
	quit(0 if success else 1)
