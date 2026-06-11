import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Make the build/index.js file executable
fs.chmodSync(path.join(__dirname, '..', 'build', 'index.js'), '755');

// Copy the scripts directory to the build directory
try {
  const sourceScriptsPath = path.join(__dirname, '..', 'src', 'scripts');
  const buildScriptsPath = path.join(__dirname, '..', 'build', 'scripts');
  fs.emptyDirSync(buildScriptsPath);
  fs.copySync(sourceScriptsPath, buildScriptsPath, { overwrite: true });

  console.log('Successfully copied src/scripts tree to build/scripts');
} catch (error) {
  console.error('Error copying scripts:', error);
  process.exit(1);
}

try {
  const sourceAddonPath = path.join(__dirname, '..', 'test_mcp_enhancements', 'addons', 'godot_mcp_live');
  const buildAddonPath = path.join(__dirname, '..', 'build', 'addons', 'godot_mcp_live');
  if (fs.existsSync(sourceAddonPath)) {
    fs.ensureDirSync(path.dirname(buildAddonPath));
    fs.copySync(sourceAddonPath, buildAddonPath, { overwrite: true });
    console.log('Successfully copied godot_mcp_live addon to build/addons');
  }
} catch (error) {
  console.error('Error copying live addon:', error);
  process.exit(1);
}

console.log('Build scripts completed successfully!');
