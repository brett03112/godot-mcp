// Quick test of the error parser logic
const testErrors = [
  "SCRIPT ERROR: Cannot call method 'queue_free' on a null value.\r",
  "   at: trigger_null_error (res://test_error_null.gd:14)\r",
];

// Simulate the parseGodotErrors function
function parseGodotErrors(errorLines) {
  const parsedErrors = [];

  const errorPatterns = [
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

        // Check next line for location info
        if (errorPattern.atPattern && i + 1 < errorLines.length) {
          const nextLine = errorLines[i + 1].trim();
          const atMatch = nextLine.match(errorPattern.atPattern);
          if (atMatch) {
            if (atMatch.length >= 4) {
              errorInfo.function = atMatch[1].trim();
              errorInfo.file = atMatch[2].trim();
              errorInfo.line = parseInt(atMatch[3]);
            }
            i++;
          }
        }

        // Add solutions
        const msg = errorInfo.message.toLowerCase();
        if (msg.includes('null') && (msg.includes('call') || msg.includes('method'))) {
          errorInfo.possible_solutions.push('Check if the object is properly initialized before accessing it');
          errorInfo.possible_solutions.push('Verify the node exists in the scene tree (use get_node() or $NodeName)');
          errorInfo.possible_solutions.push('Add null checks before accessing properties or methods');
          if (errorInfo.file && errorInfo.line) {
            errorInfo.possible_solutions.push(`Review the code at ${errorInfo.file}:${errorInfo.line} for uninitialized variables`);
          }
        }

        parsedErrors.push(errorInfo);
        break;
      }
    }
  }

  return parsedErrors;
}

const result = parseGodotErrors(testErrors);
console.log(JSON.stringify(result, null, 2));
