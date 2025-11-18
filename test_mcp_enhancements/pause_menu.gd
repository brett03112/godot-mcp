extends Control

# Called when the Resume button is pressed
func _on_resume_button_pressed():
	print("Resume button pressed - hiding pause menu")
	hide()

# Called when the Settings button is pressed
func _on_settings_button_pressed():
	print("Settings button pressed - opening settings panel")
	# In a real game, this would show a settings panel
	# For now, just print a message

# Called when the Quit button is pressed
func _on_quit_button_pressed():
	print("Quit button pressed - quitting game")
	get_tree().quit()
