# Changelog

## 0.1.0 - Unreleased

### Added

- Added the Phase 5.5 live bridge release and compatibility policy.
- Added `protocol_version`, `addon_version`, and compatibility metadata to live session registration.
- Added live protocol handshake rejection with a structured `live_protocol_incompatible` error for version mismatch cases.
- Added migration notes for future live protocol changes.

### Compatibility

- The Godot MCP Live addon supports Godot 4.6 through the current Godot 4.x line (`>=4.6 <5.0`).
- The current live bridge protocol version is `1.0.0`.
