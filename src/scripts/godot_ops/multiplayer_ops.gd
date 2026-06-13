# Phase 6.B final-pass multiplayer operation module.
extends RefCounted

var _context
var _legacy
var debug_mode = false
var _exit_code = 0

func setup(context, legacy) -> void:
    _context = context
    _legacy = legacy
    debug_mode = bool(context.debug_mode)

func get_exit_code() -> int:
    return _exit_code

func reset_exit_code() -> void:
    _exit_code = 0

func quit(code := 0) -> void:
    _exit_code = int(code)

func log_debug(message) -> void:
    if _legacy != null and _legacy.has_method("log_debug"):
        _legacy.log_debug(str(message))

func log_info(message) -> void:
    if _legacy != null and _legacy.has_method("log_info"):
        _legacy.log_info(str(message))

func log_error(message) -> void:
    if _legacy != null and _legacy.has_method("log_error"):
        _legacy.log_error(str(message))



func _to_res_path(path: String) -> String:
    return _legacy.to_res_path(path)

func _load_scene_for_edit(scene_path: String) -> Dictionary:
    return _legacy.load_scene_for_edit(scene_path)

func _save_scene_root(scene_root: Node, full_scene_path: String) -> bool:
    return _legacy.save_scene_root(scene_root, full_scene_path)

func _ensure_resource_dir(resource_path: String) -> bool:
    return _legacy.ensure_resource_dir(resource_path)

func _save_resource_to_path(resource: Resource, resource_path: String) -> bool:
    return _legacy.save_resource_to_path(resource, resource_path)

func _parse_color(value, fallback := Color.WHITE) -> Color:
    return _legacy.parse_color(value, fallback)

func _parse_vector2(value, fallback := Vector2.ZERO) -> Vector2:
    return _legacy.parse_vector2(value, fallback)

func _has_property(obj: Object, property_name: String) -> bool:
    return _legacy.has_property(obj, property_name)

func _get_edit_parent(scene_root: Node, parent_path: String) -> Node:
    return _legacy.get_edit_parent(scene_root, parent_path)

func _make_unique_child_name(parent: Node, base_name: String) -> String:
    return _legacy.make_unique_child_name(parent, base_name)


func setup_multiplayer_peer(params: Dictionary) -> void:
    log_info("Starting setup_multiplayer_peer operation")
    var scene_path: String = params.get("scene_path", "")
    var peer_type: String = params.get("peer_type", "enet")
    var mode: String = params.get("mode", "server")
    var port: int = int(params.get("port", 10567))
    var address: String = params.get("address", "127.0.0.1")
    var max_clients: int = int(params.get("max_clients", 32))
    var server_url: String = params.get("server_url", "ws://localhost:" + str(port))
    var network_node_path: String = params.get("network_node_path", ".")
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    if peer_type == "webrtc":
        log_error("WebRTC peer setup requires signaling and is not implemented by this scene helper")
        return

    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        return
    var scene = packed_scene.instantiate()
    if scene == null:
        log_error("Failed to instantiate scene")
        return
    var network_node: Node = scene
    if network_node_path != ".":
        network_node = scene.get_node_or_null(NodePath(network_node_path))
        if network_node == null:
            log_error("Network node not found: " + network_node_path)
            scene.free()
            return

    var script_path = "res://scripts/mcp_multiplayer_peer_" + _safe_file_stem(scene_path.get_basename()) + ".gd"
    if not _write_text_file(script_path, _multiplayer_peer_script_source()):
        scene.free()
        return

    var helper_node_name = _make_unique_child_name(network_node, "McpMultiplayerPeer")
    var helper_node = Node.new()
    helper_node.name = helper_node_name
    var helper_script = load(script_path) as Script
    if helper_script == null:
        log_error("Failed to load generated multiplayer helper script: " + script_path)
        scene.free()
        return
    helper_node.set_script(helper_script)
    helper_node.set("peer_type", peer_type)
    helper_node.set("mode", mode)
    helper_node.set("port", port)
    helper_node.set("address", address)
    helper_node.set("max_clients", max_clients)
    helper_node.set("server_url", server_url)
    network_node.add_child(helper_node)
    helper_node.owner = scene
    network_node.set_multiplayer_authority(1 if mode == "server" else 0)

    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    scene.free()
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        return
    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        return
    var result = {"success":true,"peer_type":peer_type,"mode":mode,"port":port,"address":address if mode=="client" else "","max_clients":max_clients if mode=="server" else 0,"network_node":network_node_path,"helper_node":helper_node_name,"script_path":script_path,"note":"A runtime helper node creates and assigns the MultiplayerPeer when the scene enters the tree."}
    print(JSON.stringify(result))
    log_info("setup_multiplayer_peer completed successfully")

func configure_rpc(params: Dictionary) -> void:
    log_info("Starting configure_rpc operation")
    var scene_path: String = params.get("scene_path", "")
    var node_path: String = params.get("node_path", "")
    var method_name: String = params.get("method_name", "")
    var call_mode: String = params.get("call_mode", "authority")
    var transfer_mode: String = params.get("transfer_mode", "reliable")
    var channel: int = int(params.get("channel", 0))
    var sync: bool = params.get("sync", true)
    if scene_path.is_empty() or node_path.is_empty() or method_name.is_empty():
        log_error("scene_path, node_path, and method_name are required")
        return
    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        return
    var scene = packed_scene.instantiate()
    if scene == null:
        log_error("Failed to instantiate scene")
        return
    var target_node: Node = scene
    if node_path != ".":
        target_node = scene.get_node_or_null(NodePath(node_path))
        if target_node == null:
            log_error("Node not found: " + node_path)
            scene.free()
            return
    var sync_mode = "call_local" if sync else "call_remote"
    var rpc_annotation = "@rpc(\"" + call_mode + "\", \"" + sync_mode + "\", \"" + transfer_mode + "\", " + str(channel) + ")"
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    scene.free()
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        return
    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        return
    var result = {"success":true,"node_path":node_path,"method_name":method_name,"rpc_annotation":rpc_annotation,"call_mode":call_mode,"transfer_mode":transfer_mode,"channel":channel,"sync":sync,"note":"RPC configuration saved. Add '" + rpc_annotation + "\nfunc " + method_name + "()' to the node script."}
    print(JSON.stringify(result))
    log_info("configure_rpc completed successfully")

func manage_multiplayer_spawner(params: Dictionary) -> void:
    log_info("Starting manage_multiplayer_spawner operation")
    var scene_path: String = params.get("scene_path", "")
    var parent_path: String = params.get("parent_path", ".")
    var action: String = params.get("action", "add_both")
    var spawn_path: String = params.get("spawn_path", "")
    var spawn_limit: int = int(params.get("spawn_limit", 0))
    var spawn_function: String = params.get("spawn_function", "")
    var sync_properties: Array = params.get("sync_properties", [])
    var sync_interval: float = float(params.get("sync_interval", 0.0))
    var visibility_sync: bool = params.get("visibility_sync", false)
    var visibility_update_only: bool = params.get("visibility_update_only", false)
    var replication_interval: float = float(params.get("replication_interval", 0.0))
    if scene_path.is_empty():
        log_error("scene_path is required")
        return
    var full_scene_path = "res://" + scene_path
    var packed_scene = load(full_scene_path) as PackedScene
    if packed_scene == null:
        log_error("Failed to load scene: " + full_scene_path)
        return
    var scene = packed_scene.instantiate()
    if scene == null:
        log_error("Failed to instantiate scene")
        return
    var parent: Node = scene
    if parent_path != ".":
        parent = scene.get_node_or_null(NodePath(parent_path))
        if parent == null:
            log_error("Parent node not found: " + parent_path)
            scene.free()
            return
    var added_nodes: Array = []
    var spawner_name = "MultiplayerSpawner"
    var sync_name = "MultiplayerSynchronizer"
    var counter = 1
    while parent.has_node(spawner_name):
        spawner_name = "MultiplayerSpawner" + str(counter)
        counter += 1
    counter = 1
    while parent.has_node(sync_name):
        sync_name = "MultiplayerSynchronizer" + str(counter)
        counter += 1
    var spawner: MultiplayerSpawner = null
    var synchronizer: MultiplayerSynchronizer = null
    if action in ["add_spawner", "configure_spawner", "add_both"]:
        spawner = MultiplayerSpawner.new()
        spawner.name = spawner_name
        if not spawn_path.is_empty(): spawner.spawn_path = spawn_path
        if spawn_limit > 0: spawner.spawn_limit = spawn_limit
        if not spawn_function.is_empty(): spawner.set("spawn_function", spawn_function)
        if replication_interval > 0 and _has_property(spawner, "replication_interval"):
            spawner.set("replication_interval", replication_interval)
        parent.add_child(spawner)
        spawner.owner = scene
        added_nodes.append("MultiplayerSpawner: " + spawner.name)
    if action in ["add_synchronizer", "configure_synchronizer", "add_both"]:
        synchronizer = MultiplayerSynchronizer.new()
        synchronizer.name = sync_name
        if sync_properties.size() > 0:
            var replication_config = SceneReplicationConfig.new()
            for prop in sync_properties:
                replication_config.add_property(NodePath(str(prop)))
            synchronizer.replication_config = replication_config
        if sync_interval > 0: synchronizer.replication_interval = sync_interval
        if visibility_sync:
            synchronizer.public_visibility = true
        parent.add_child(synchronizer)
        synchronizer.owner = scene
        added_nodes.append("MultiplayerSynchronizer: " + synchronizer.name)
    if added_nodes.is_empty():
        log_error("No nodes were added. Check the action parameter.")
        scene.free()
        return
    var new_packed = PackedScene.new()
    var pack_err = new_packed.pack(scene)
    scene.free()
    if pack_err != OK:
        log_error("Failed to pack scene: " + str(pack_err))
        return
    var save_err = ResourceSaver.save(new_packed, full_scene_path)
    if save_err != OK:
        log_error("Failed to save scene: " + str(save_err))
        return
    var result = {"success":true,"scene_path":scene_path,"parent_path":parent_path,"action":action,"added_nodes":added_nodes,"spawn_path":spawn_path if not spawn_path.is_empty() else "(not set)","sync_properties_count":sync_properties.size()}
    print(JSON.stringify(result))
    log_info("manage_multiplayer_spawner completed successfully")


# --- Tier 14/16 shared helpers ---

func _safe_file_stem(value: String) -> String:
    var safe = ""
    for i in range(value.length()):
        var c = value.substr(i, 1)
        if c.is_valid_identifier() or c.is_valid_int() or c == "_":
            safe += c
        elif c in ["/", "\\", ".", "-", " "]:
            safe += "_"
    if safe.is_empty():
        return "generated"
    return safe

func _write_text_file(res_path: String, text: String) -> bool:
    var full_path = _to_res_path(res_path)
    var absolute_path = ProjectSettings.globalize_path(full_path)
    var dir_path = absolute_path.get_base_dir()
    if not DirAccess.dir_exists_absolute(dir_path):
        DirAccess.make_dir_recursive_absolute(dir_path)
    var file = FileAccess.open(full_path, FileAccess.WRITE)
    if file == null:
        log_error("Failed to open file for writing: " + full_path)
        return false
    file.store_string(text)
    file.close()
    return true

func _multiplayer_peer_script_source() -> String:
    return """extends Node

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
"""


# --- Phase 4.5: Asset pipeline helpers ---
