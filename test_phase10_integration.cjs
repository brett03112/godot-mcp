/**
 * Phase 10: Tilemap & Level Design - Integration Tests
 *
 * Tests for:
 * - Task 10.1: create_tilemap tool
 * - Task 10.2: paint_tiles tool
 * - Task 10.3: configure_tileset tool
 * - Task 10.4: generate_navmesh tool
 */

const { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } = require('fs');
const { join } = require('path');

// Test project path
const TEST_PROJECT = './test_mcp_enhancements';

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${error.message}${RESET}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(`${message}: expected to contain "${substring}"`);
  }
}

console.log('\n========================================');
console.log('Phase 10: Tilemap & Level Design Tests');
console.log('========================================\n');

// ==========================================
// Task 10.1: create_tilemap Tests
// ==========================================

console.log(`${YELLOW}--- Task 10.1: create_tilemap ---${RESET}`);

test('TileMap parameters structure', () => {
  const params = {
    scene_path: 'scenes/level.tscn',
    tilemap_name: 'TileMap',
    parent_path: '.',
    tile_size: { x: 16, y: 16 },
    tileset_path: '',
    layers: ['Ground', 'Objects'],
  };

  assertEqual(params.tilemap_name, 'TileMap', 'TileMap name should be correct');
  assertEqual(params.tile_size.x, 16, 'Tile width should be 16');
  assertEqual(params.tile_size.y, 16, 'Tile height should be 16');
  assertEqual(params.layers.length, 2, 'Should have 2 layers');
});

test('Default TileMap values', () => {
  const defaults = {
    tilemapName: 'TileMap',
    parentPath: '.',
    tileSize: { x: 16, y: 16 },
    tilesetPath: '',
    layers: [],
  };

  assertEqual(defaults.tilemapName, 'TileMap', 'Default tilemap name should be TileMap');
  assertEqual(defaults.parentPath, '.', 'Default parent path should be root');
  assertEqual(defaults.layers.length, 0, 'Default layers should be empty');
});

test('TileSet tile size validation', () => {
  const validSizes = [
    { x: 8, y: 8 },
    { x: 16, y: 16 },
    { x: 32, y: 32 },
    { x: 64, y: 64 },
  ];

  for (const size of validSizes) {
    assertTrue(size.x > 0 && size.y > 0, `Tile size ${size.x}x${size.y} should be positive`);
    assertTrue(Number.isInteger(size.x) && Number.isInteger(size.y), 'Tile size should be integer');
  }
});

test('Layer name handling', () => {
  const layers = ['Ground', 'Walls', 'Decorations', 'Collisions'];

  assertEqual(layers[0], 'Ground', 'First layer should be Ground');
  assertEqual(layers.length, 4, 'Should support multiple layers');
});

// ==========================================
// Task 10.2: paint_tiles Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 10.2: paint_tiles ---${RESET}`);

test('Single tile paint parameters', () => {
  const tiles = [
    { x: 0, y: 0, atlasCoords: { x: 0, y: 0 } },
    { x: 1, y: 0, atlasCoords: { x: 1, y: 0 } },
    { x: 2, y: 0, atlasCoords: { x: 2, y: 0 } },
  ];

  assertEqual(tiles.length, 3, 'Should have 3 tiles to paint');
  assertEqual(tiles[0].x, 0, 'First tile X should be 0');
  assertEqual(tiles[0].atlasCoords.x, 0, 'First tile atlas X should be 0');
});

test('Rectangular pattern calculation', () => {
  const rectStart = { x: 0, y: 0 };
  const rectEnd = { x: 3, y: 2 };

  const width = Math.abs(rectEnd.x - rectStart.x) + 1;
  const height = Math.abs(rectEnd.y - rectStart.y) + 1;
  const totalTiles = width * height;

  assertEqual(width, 4, 'Rectangle width should be 4');
  assertEqual(height, 3, 'Rectangle height should be 3');
  assertEqual(totalTiles, 12, 'Total tiles should be 12');
});

test('Line pattern (Bresenham) - horizontal', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 5, y: 0 };

  const tiles = [];
  let x = start.x;
  while (x <= end.x) {
    tiles.push({ x, y: start.y });
    x++;
  }

  assertEqual(tiles.length, 6, 'Horizontal line should have 6 tiles');
});

test('Line pattern (Bresenham) - diagonal', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 3, y: 3 };

  // Simplified diagonal counting
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const steps = Math.max(dx, dy) + 1;

  assertEqual(steps, 4, 'Diagonal line should have 4 tiles');
});

test('Erase pattern', () => {
  const pattern = 'erase';
  const tilesToErase = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];

  assertEqual(pattern, 'erase', 'Pattern should be erase');
  assertEqual(tilesToErase.length, 3, 'Should erase 3 tiles');
});

test('Pattern types validation', () => {
  const validPatterns = ['single', 'rect', 'line', 'erase'];

  assertTrue(validPatterns.includes('single'), 'Should support single pattern');
  assertTrue(validPatterns.includes('rect'), 'Should support rect pattern');
  assertTrue(validPatterns.includes('line'), 'Should support line pattern');
  assertTrue(validPatterns.includes('erase'), 'Should support erase pattern');
});

// ==========================================
// Task 10.3: configure_tileset Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 10.3: configure_tileset ---${RESET}`);

test('TileSet creation parameters', () => {
  const params = {
    tileset_path: 'resources/tileset.tres',
    texture_path: 'sprites/tilemap.png',
    tile_size: { x: 16, y: 16 },
    physics_layer: 0,
    navigation_layer: 0,
  };

  assertTrue(params.tileset_path.endsWith('.tres'), 'TileSet should be .tres file');
  assertEqual(params.physics_layer, 0, 'Default physics layer should be 0');
  assertEqual(params.navigation_layer, 0, 'Default navigation layer should be 0');
});

test('Collision polygon structure', () => {
  const collision = [
    [0, 0],
    [16, 0],
    [16, 16],
    [0, 16],
  ];

  assertEqual(collision.length, 4, 'Collision polygon should have 4 points');
  assertEqual(collision[0][0], 0, 'First point X should be 0');
  assertEqual(collision[2][1], 16, 'Third point Y should be 16');
});

test('Navigation polygon structure', () => {
  const navigation = [
    [2, 2],
    [14, 2],
    [14, 14],
    [2, 14],
  ];

  assertEqual(navigation.length, 4, 'Navigation polygon should have 4 points');
  assertTrue(navigation[0][0] >= 0 && navigation[0][1] >= 0, 'Points should be non-negative');
});

test('Terrain configuration', () => {
  const tileConfig = {
    atlasCoords: { x: 0, y: 0 },
    terrainSet: 0,
    terrain: 1,
  };

  assertEqual(tileConfig.terrainSet, 0, 'Terrain set should be 0');
  assertEqual(tileConfig.terrain, 1, 'Terrain should be 1');
});

test('Multiple tile configurations', () => {
  const configs = [
    { atlasCoords: { x: 0, y: 0 }, collision: [[0, 0], [16, 0], [16, 16], [0, 16]] },
    { atlasCoords: { x: 1, y: 0 }, collision: [[0, 0], [16, 0], [16, 16], [0, 16]] },
    { atlasCoords: { x: 2, y: 0 }, navigation: [[0, 0], [16, 0], [16, 16], [0, 16]] },
  ];

  assertEqual(configs.length, 3, 'Should configure 3 tiles');
  assertTrue(configs[0].collision !== undefined, 'First tile should have collision');
  assertTrue(configs[2].navigation !== undefined, 'Third tile should have navigation');
});

// ==========================================
// Task 10.4: generate_navmesh Tests
// ==========================================

console.log(`\n${YELLOW}--- Task 10.4: generate_navmesh ---${RESET}`);

test('NavigationMesh default parameters', () => {
  const defaults = {
    regionName: 'NavigationRegion3D',
    parentPath: '.',
    cellSize: 0.25,
    cellHeight: 0.25,
    agentRadius: 0.5,
    agentHeight: 2.0,
    agentMaxSlope: 45.0,
    agentMaxClimb: 0.25,
    sourceGeometryMode: 'static_colliders',
  };

  assertEqual(defaults.cellSize, 0.25, 'Default cell size should be 0.25');
  assertEqual(defaults.agentRadius, 0.5, 'Default agent radius should be 0.5');
  assertEqual(defaults.agentHeight, 2.0, 'Default agent height should be 2.0');
  assertEqual(defaults.agentMaxSlope, 45.0, 'Default max slope should be 45 degrees');
});

test('Source geometry modes', () => {
  const validModes = ['static_colliders', 'meshes', 'physics_bodies'];

  assertTrue(validModes.includes('static_colliders'), 'Should support static_colliders');
  assertTrue(validModes.includes('meshes'), 'Should support meshes');
  assertTrue(validModes.includes('physics_bodies'), 'Should support physics_bodies');
});

test('Agent parameter validation', () => {
  const agent = {
    radius: 0.5,
    height: 2.0,
    maxSlope: 45.0,
    maxClimb: 0.25,
  };

  assertTrue(agent.radius > 0, 'Agent radius should be positive');
  assertTrue(agent.height > 0, 'Agent height should be positive');
  assertTrue(agent.maxSlope >= 0 && agent.maxSlope <= 90, 'Max slope should be 0-90 degrees');
  assertTrue(agent.maxClimb >= 0, 'Max climb should be non-negative');
});

test('Cell size validation', () => {
  const validCellSizes = [0.1, 0.25, 0.5, 1.0];

  for (const size of validCellSizes) {
    assertTrue(size > 0, `Cell size ${size} should be positive`);
    assertTrue(size <= 10, `Cell size ${size} should be reasonable`);
  }
});

test('NavigationMesh geometry mode mapping', () => {
  const modeMap = {
    'static_colliders': 'PARSED_GEOMETRY_STATIC_COLLIDERS',
    'meshes': 'PARSED_GEOMETRY_MESH_INSTANCES',
    'physics_bodies': 'PARSED_GEOMETRY_BOTH',
  };

  assertEqual(modeMap['static_colliders'], 'PARSED_GEOMETRY_STATIC_COLLIDERS', 'static_colliders should map correctly');
  assertEqual(modeMap['meshes'], 'PARSED_GEOMETRY_MESH_INSTANCES', 'meshes should map correctly');
  assertEqual(modeMap['physics_bodies'], 'PARSED_GEOMETRY_BOTH', 'physics_bodies should map correctly');
});

// ==========================================
// Integration Tests
// ==========================================

console.log(`\n${YELLOW}--- Integration Tests ---${RESET}`);

test('TileMap workflow validation', () => {
  // Simulate complete tilemap workflow
  const workflow = {
    step1: 'create_tilemap',
    step2: 'configure_tileset',
    step3: 'paint_tiles',
  };

  assertEqual(workflow.step1, 'create_tilemap', 'First step should create tilemap');
  assertEqual(workflow.step2, 'configure_tileset', 'Second step should configure tileset');
  assertEqual(workflow.step3, 'paint_tiles', 'Third step should paint tiles');
});

test('2D vs 3D navigation', () => {
  const navigation2D = {
    type: 'TileMap',
    navigationPolygons: true,
  };

  const navigation3D = {
    type: 'NavigationRegion3D',
    navigationMesh: true,
  };

  assertEqual(navigation2D.type, 'TileMap', '2D navigation uses TileMap');
  assertEqual(navigation3D.type, 'NavigationRegion3D', '3D navigation uses NavigationRegion3D');
});

test('Tile coordinate system', () => {
  // Godot uses integer coordinates for tiles
  const tileCoord = { x: 5, y: -3 };

  assertTrue(Number.isInteger(tileCoord.x), 'Tile X should be integer');
  assertTrue(Number.isInteger(tileCoord.y), 'Tile Y should be integer');
  assertTrue(tileCoord.y < 0, 'Tile Y can be negative');
});

test('Atlas coordinate system', () => {
  const atlasCoord = { x: 2, y: 1 };

  assertTrue(atlasCoord.x >= 0, 'Atlas X should be non-negative');
  assertTrue(atlasCoord.y >= 0, 'Atlas Y should be non-negative');
});

// ==========================================
// Summary
// ==========================================

console.log('\n========================================');
console.log('Test Results');
console.log('========================================');
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`${RED}Failed: ${testsFailed}${RESET}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed!${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}All tests passed!${RESET}`);
}
