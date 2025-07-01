import {
  Diagnostic,
  DiagnosticSeverity,
  TextDocument
} from 'vscode-languageserver';

// Keywords that indicate the end of a LOAD or SELECT block
const RESERVED_WORDS = new Set([
  'from', 'resident', 'join', 'inner', 'left', 'right', 'outer',
  'let', 'set', 'where', 'group', 'order', 'by', 'as', 'if', 'then', 'else', 'load', 'select'
]);

export function getCommaDiagnostics(
  text: string,
  textDocument: TextDocument,
  maxProblems: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  let inLoadBlock = false;
  let documentOffset = 0;
  let problems = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim().toLowerCase();

    if (problems >= maxProblems) break;

    // Detect start of LOAD or SELECT
    if (/^\s*(load|select)\b/i.test(trimmed)) {
      inLoadBlock = true;
      documentOffset += line.length + 1;
      continue;
    }

    // Detect end of LOAD/SELECT block
    if (inLoadBlock && /\b(from|resident)\b/i.test(trimmed)) {
      inLoadBlock = false;
      documentOffset += line.length + 1;
      continue;
    }

    if (inLoadBlock) {
      const isLastLoadLine =
        i + 1 < lines.length &&
        /\b(from|resident)\b/i.test(lines[i + 1].trim().toLowerCase());

      const codeOnly = line.split('//')[0].trim();

      if (codeOnly === '' || codeOnly === ';') {
        documentOffset += line.length + 1;
        continue;
      }

      const endsWithComma = /,\s*$/.test(codeOnly);

      // 🚨 Check for trailing comma before FROM
      if (endsWithComma && isLastLoadLine) {
        const commaIndex = codeOnly.lastIndexOf(',');
        const absoluteIndex = documentOffset + commaIndex;

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: textDocument.positionAt(absoluteIndex),
            end: textDocument.positionAt(absoluteIndex + 1),
          },
          message: `Trailing comma before FROM or RESIDENT is not allowed.`,
          source: 'Qlik Linter'
        });

        problems++;
        if (problems >= maxProblems) break;
        documentOffset += line.length + 1;
        continue;
      }

      // 🚨 Check for missing comma if not last line
      if (!endsWithComma && !isLastLoadLine) {
        // Skip if line is just whitespace or suspiciously bracketed/quoted
        const isQuoteOrBracketed =
          /^[\s']/.test(codeOnly) || codeOnly.includes(' AS ') || codeOnly.includes('[');

        if (!isQuoteOrBracketed) {
          const absoluteIndex = documentOffset + codeOnly.length;

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: textDocument.positionAt(absoluteIndex - 1),
              end: textDocument.positionAt(absoluteIndex),
            },
            message: `Missing comma at end of LOAD line.`,
            source: 'Qlik Linter',
          });

          problems++;
          if (problems >= maxProblems) break;
        }
      }
    }

    documentOffset += line.length + 1;
  }

  return diagnostics;
}
