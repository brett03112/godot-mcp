extends GutTest
## Auto-generated tests for Coin

const CoinScript = preload("res://coin.gd")

var _instance

func before_each():
	_instance = Coin.new()
	add_child_autofree(_instance)

func test_collect_works_correctly():
	## collect works correctly
	assert_eq(_instance.collect, called, "collect should be called")
