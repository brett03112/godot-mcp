extends GutTest
## Auto-generated tests for Coin

const CoinScript = preload("res://coin.gd")

var _instance

func before_each():
	_instance = Coin.new()
	add_child_autofree(_instance)

func test_emit_collected_signal_when_collect_is_called():
	## should emit collected signal when collect is called
	watch_signals(_instance)
	# TODO: trigger action that emits collected
	assert_signal_emitted(_instance, "collected")

func test_queue_free_on_collect():
	## should queue_free on collect
	# TODO: Implement test for: should queue_free on collect
	pending("Not yet implemented")

func test_have_points_equal_to_10_by_default():
	## should have points equal to 10 by default
	assert_eq(_instance.points, 10, "points should be 10")
