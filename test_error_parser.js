// Quick test of the error parser logic
const testErrors = [
  "SCRIPT ERROR: Cannot call method 'queue_free' on a null value.\r",
  "   at: trigger_null_error (res://test_error_null.gd:14)\r",
];

const testSyntaxErrors = [
  "Debugger Break, Reason: 'Parser Error: Unexpected \"Indent\" in class body.'\r",
  "*Frame 0 - res://test_error_syntax.gd:7 in function ''\r",
];

// Simulate the parseGodotErrors function
function parseGodotErrors(errorLines) {
  const parsedErrors = [];

  const errorPatterns = [
    {
      pattern: /Debugger Break, Reason: '(?:Parser Error: )?(.+?)'/,
      framePattern: /\*Frame \d+ - (.+?):(\d+) in function '(.*)'/,
      type: 'PARSE_ERROR',
    },
    {
      pattern: /ERROR:\s*(.+)/,
      atPattern: /at:\s*(.+?)\s*\((.+?):(\d+)\)/,
      type: 'ERROR',
    },
    {
      pattern: /SCRIPT ERROR:\s*(.+)/,
      atPattern: /at:\s*(.+?)\s*\((.+?):(\d+)\)/,
      type: 'SCRIPT_ERROR',
    },
    {
      pattern: /Parse error:\s*(.+)/,
      atPattern: /at:\s*(.+?):(\d+)/,
      type: 'PARSE_ERROR',
    },
    {
      pattern: /WARNING:\s*(.+)/,
      atPattern: /at:\s*(.+?)\s*\((.+?):(\d+)\)/,
      type: 'WARNING',
    },
  ];

  for (let i = 0; i < errorLines.length; i++) {
    const line = errorLines[i].trim();
    if (!line) continue;

    for (const errorPattern of errorPatterns) {
      const match = line.match(errorPattern.pattern);
      if (match) {
        let errorInfo = {
          type: errorPattern.type,
          message: match[1].trim(),
          raw_line: line,
          possible_solutions: [],
        };

        // Check for Debugger Break *Frame format
        if (errorPattern.framePattern && i + 1 < errorLines.length) {
          const nextLine = errorLines[i + 1].trim();
          const frameMatch = nextLine.match(errorPattern.framePattern);
          if (frameMatch) {
            errorInfo.file = frameMatch[1].trim();
            errorInfo.line = parseInt(frameMatch[2]);
            errorInfo.function = frameMatch[3].trim();
            i++;
          }
        }
        // Check next line for location info
        else if (errorPattern.atPattern && i + 1 < errorLines.length) {
          const nextLine = errorLines[i + 1].trim();
          const atMatch = nextLine.match(errorPattern.atPattern);
          if (atMatch) {
            if (atMatch.length >= 4) {
              // Format: at: function (file:line)
              errorInfo.function = atMatch[1].trim();
              errorInfo.file = atMatch[2].trim();
              errorInfo.line = parseInt(atMatch[3]);
            } else if (atMatch.length === 3) {
              // Format: at: file:line (no function)
              errorInfo.file = atMatch[1].trim();
              errorInfo.line = parseInt(atMatch[2]);
            }
            i++;
          }
        }

        // Add solutions
        const msg = errorInfo.message.toLowerCase();

        // Null reference errors
        if (msg.includes('null') && (msg.includes('call') || msg.includes('method'))) {
          errorInfo.possible_solutions.push('Check if the object is properly initialized before accessing it');
          errorInfo.possible_solutions.push('Verify the node exists in the scene tree (use get_node() or $NodeName)');
          errorInfo.possible_solutions.push('Add null checks before accessing properties or methods');
          if (errorInfo.file && errorInfo.line) {
            errorInfo.possible_solutions.push(`Review the code at ${errorInfo.file}:${errorInfo.line} for uninitialized variables`);
          }
        }

        // Invalid get index errors
        if (msg.includes('invalid get index') || msg.includes('index out of bounds')) {
          errorInfo.possible_solutions.push('Check array/dictionary bounds before accessing elements');
          errorInfo.possible_solutions.push('Verify the key exists in the dictionary before accessing it');
          errorInfo.possible_solutions.push('Ensure the array has elements before indexing');
        }

        // Parse errors
        if (errorInfo.type === 'PARSE_ERROR') {
          errorInfo.possible_solutions.push('Check for syntax errors (missing colons, parentheses, etc.)');
          errorInfo.possible_solutions.push('Verify proper indentation (use tabs consistently)');
          errorInfo.possible_solutions.push('Check for typos in keywords or function names');
          if (errorInfo.file && errorInfo.line) {
            errorInfo.possible_solutions.push(`Fix the syntax error at ${errorInfo.file}:${errorInfo.line}`);
          }
        }

        // Warnings - provide generic advice
        if (errorInfo.type === 'WARNING' && errorInfo.possible_solutions.length === 0) {
          errorInfo.possible_solutions.push('Review the warning and determine if action is needed');
          if (errorInfo.file && errorInfo.line) {
            errorInfo.possible_solutions.push(`Check ${errorInfo.file}:${errorInfo.line} for the warning source`);
          }
        }

        parsedErrors.push(errorInfo);
        break;
      }
    }
  }

  return parsedErrors;
}

console.log('=== Testing Null Reference Error ===');
const result = parseGodotErrors(testErrors);
console.log(JSON.stringify(result, null, 2));

console.log('\n=== Testing Syntax Error (Debugger Break format) ===');
const syntaxResult = parseGodotErrors(testSyntaxErrors);
console.log(JSON.stringify(syntaxResult, null, 2));

// Test 3.1.3: Multiple errors in a single stream
const testMultipleErrors = [
  "SCRIPT ERROR: Cannot call method 'get_name' on a null value.\r",
  "   at: trigger_null_error (res://test_error_multiple.gd:20)\r",
  "",
  "SCRIPT ERROR: Invalid get index '10' (on base: 'Array').\r",
  "   at: trigger_index_error (res://test_error_multiple.gd:24)\r",
  "",
  "WARNING: The function 'some_function()' returns a value that isn't used.\r",
  "   at: _ready (res://test_error_multiple.gd:10)\r",
  "",
  "Parse error: Expected end of statement after variable declaration, found \";\" instead.\r",
  "   at: res://test_error_multiple.gd:35\r",
];

console.log('\n=== Test 3.1.3: Multiple Errors ===');
const multipleResult = parseGodotErrors(testMultipleErrors);
console.log(JSON.stringify(multipleResult, null, 2));
console.log(`\nTotal errors captured: ${multipleResult.length}`);
