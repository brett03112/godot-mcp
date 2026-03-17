extends GutTest
## Auto-generated tests for Coin

var _instance

func before_each():
	_instance = Coin.new()
	add_child_autofree(_instance)

func test_emit_collected_signal():
	## should emit collected signal
	watch_signals(_instance)
	# TODO: trigger action that emits collected
	assert_signal_emitted(_instance, "collected")
