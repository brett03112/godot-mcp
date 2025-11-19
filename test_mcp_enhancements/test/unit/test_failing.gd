# GUT test file with intentional failures
# Generated for Task 6.2.2 testing

extends GutTest

# This test should fail
func test_intentional_failure():
	assert_eq(1 + 1, 3, "This should fail - 1 + 1 does not equal 3")
	assert_true(false, "This should also fail")

# This test should pass
func test_passing():
	assert_eq(2 + 2, 4, "This should pass")
