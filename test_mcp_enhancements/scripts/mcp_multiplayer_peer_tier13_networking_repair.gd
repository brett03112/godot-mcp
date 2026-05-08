extends Node

@export_enum("enet", "websocket") var peer_type := "enet"
@export_enum("server", "client") var mode := "server"
@export var port := 10567
@export var address := "127.0.0.1"
@export var max_clients := 32
@export var server_url := "ws://localhost:10567"

func _ready() -> void:
    var peer: MultiplayerPeer = null
    var err := OK

    match peer_type:
        "enet":
            var enet_peer := ENetMultiplayerPeer.new()
            if mode == "server":
                err = enet_peer.create_server(port, max_clients)
            else:
                err = enet_peer.create_client(address, port)
            peer = enet_peer
        "websocket":
            var ws_peer := WebSocketMultiplayerPeer.new()
            if mode == "server":
                err = ws_peer.create_server(port)
            else:
                err = ws_peer.create_client(server_url)
            peer = ws_peer
        _:
            push_error("Unsupported multiplayer peer_type: " + peer_type)
            return

    if err != OK:
        push_error("Failed to create multiplayer peer: " + str(err))
        return

    get_tree().get_multiplayer().multiplayer_peer = peer
