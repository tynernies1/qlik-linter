import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-languageserver';

// Reserved words that should not trigger comma errors
const RESERVED_WORDS = new Set([
  'from', 'resident', 'join', 'inner', 'left', 'right', 'outer',
  'let', 'set', 'where', 'group', 'order', 'by', 'as', 'if', 'then', 'else', 'load', 'select'
]);

export function getCommaDiagnostics(
  text: string,
  textDocument: TextDocument,
  maxProblems: number
): Diagnostic[] {
  let problems = 0;
  const diagnostics: Diagnostic[] = [];

  const lines = text.split(/\r?\n/);
  let inLoad = false;
  let documentIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (problems >= maxProblems) break;

    // Detect start of LOAD or SELECT block
    if (/^\s*(load|select)\b/i.test(trimmed)) {
      inLoad = true;
    }

    // Detect end of block (FROM or RESIDENT)
    if (inLoad && /\b(from|resident)\b/i.test(trimmed)) {
      inLoad = false;
    }

    if (inLoad) {
      // Remove inline comments
      const codeOnly = line.split('//')[0].trim();

      // Regex to find pairs of adjacent words with only whitespace between them
      const noCommaPattern = /(\b\w+\b)\s+(\b\w+\b)/g;
      let match;
      while ((match = noCommaPattern.exec(codeOnly)) !== null) {
        const [full, left, right] = match;
        const startIdx = match.index;

        const leftLower = left.toLowerCase();
        const rightLower = right.toLowerCase();

        // Skip if either is reserved (e.g. 'FROM price')
        if (RESERVED_WORDS.has(leftLower) || RESERVED_WORDS.has(rightLower)) continue;

        // Skip if left is a function call like Sum(price)
        if (/\w+\(.*\)/.test(left)) continue;

        // Skip if context includes ' AS '
        const context = codeOnly.substring(startIdx, startIdx + full.length).toLowerCase();
        if (context.includes(' as ')) continue;

        // Check if a comma follows the left token in source code
        const charAfterLeft = codeOnly[startIdx + left.length];
        if (charAfterLeft !== ',') {
          const absoluteIndex = documentIndex + startIdx + left.length;

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: textDocument.positionAt(absoluteIndex),
              end: textDocument.positionAt(absoluteIndex + 1),
            },
            message: `Missing comma between '${left}' and '${right}' in LOAD or SELECT statement.`,
            source: 'Qlik Linter'
          });

          problems++;
          if (problems >= maxProblems) break;
        }
      }
    }

    documentIndex += line.length + 1;
  }

  return diagnostics;
}
