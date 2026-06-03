extends GutTest
## Auto-generated tests for Coin

var _instance

func before_each():
	_instance = Coin.new()
	add_child_autofree(_instance)

func after_each():
	_instance = null

func test_be_valid_after_init():
	## should be valid after init
	# TODO: Implement test for: should be valid after init
	pending("Not yet implemented")
