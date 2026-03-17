extends GutTest
## Auto-generated tests for Coin

var _instance

func before_each():
	_instance = Coin.new()
	add_child_autofree(_instance)

func test_points_equals_10():
	## points equals 10
	assert_eq(_instance.points, 10, "points should be 10")
