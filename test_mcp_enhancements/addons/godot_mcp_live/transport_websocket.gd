@tool
class_name GodotMCPLiveTransportWebSocket
extends RefCounted

var _peer: WebSocketPeer = WebSocketPeer.new()
var _server_url: String = ""
var _state: GodotMCPLiveSessionState


func configure(server_url: String, state: GodotMCPLiveSessionState) -> void:
	_server_url = server_url
	_state = state
	_state.configure(server_url)


func connect_to_server() -> int:
	if _server_url == "":
		_state.mark_disconnected("Missing WebSocket server URL.")
		return ERR_INVALID_PARAMETER

	if _peer.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		_peer.close()
	_peer = WebSocketPeer.new()

	_state.mark_connecting()
	var err := _peer.connect_to_url(_server_url)
	if err != OK:
		_state.mark_disconnected("WebSocket connect failed with error %s." % err)
		return err

	return OK


func disconnect_from_server() -> void:
	if _peer.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		_peer.close()
	_state.mark_disconnected()


func poll(dispatcher: GodotMCPLiveCommandDispatcher) -> void:
	_peer.poll()
	var ready_state := _peer.get_ready_state()

	if ready_state == WebSocketPeer.STATE_OPEN:
		if _state.connection_state != "connected":
			_state.mark_connected()
			send_json({
				"kind": "hello",
				"session": _state.to_dictionary(),
			})

		while _peer.get_available_packet_count() > 0:
			var packet_text := _peer.get_packet().get_string_from_utf8()
			var parsed := JSON.parse_string(packet_text)
			if typeof(parsed) != TYPE_DICTIONARY:
				_state.record_error("Received non-dictionary WebSocket payload.")
				continue

			var response = await dispatcher.handle_message(parsed)
			send_json(response)
	elif ready_state == WebSocketPeer.STATE_CLOSING:
		_state.connection_state = "closing"
	elif ready_state == WebSocketPeer.STATE_CLOSED and _state.connection_state in ["connecting", "connected", "closing"]:
		_state.mark_disconnected()


func is_transport_connected() -> bool:
	return _peer.get_ready_state() == WebSocketPeer.STATE_OPEN


func send_json(payload: Dictionary) -> int:
	if not is_transport_connected():
		return ERR_UNCONFIGURED

	var text := JSON.stringify(payload)
	return _peer.send_text(text)
