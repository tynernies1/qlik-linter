import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-languageserver';

export function getParenthesisDiagnostics(
	text: string,
	textDocument: TextDocument,
	maxProblems: number
): Diagnostic[] {
	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	const lines = text.split(/\r?\n/);
	let documentIndex = 0;
	const parenStack: { pos: number }[] = [];

	for (const line of lines) {
		for (let j = 0; j < line.length; j++) {
			const char = line[j];
			if (char === '(') {
				parenStack.push({ pos: documentIndex + j });
			} else if (char === ')') {
				if (parenStack.length === 0) {
					if (problems >= maxProblems) {
						break;
					}
					diagnostics.push({
						severity: DiagnosticSeverity.Error,
						range: {
							start: textDocument.positionAt(documentIndex + j),
							end: textDocument.positionAt(documentIndex + j + 1)
						},
						message: 'Unmatched closing parenthesis `)`',
						source: 'Qlik Linter'
					});
					problems++;
				} else {
					parenStack.pop();
				}
			}
		}
		documentIndex += line.length + 1; // +1 accounts for newline
	}

	for (const unmatched of parenStack) {
		if (problems >= maxProblems) {
			break;
		}
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			range: {
				start: textDocument.positionAt(unmatched.pos),
				end: textDocument.positionAt(unmatched.pos + 1)
			},
			message: 'Unmatched opening parenthesis `(`',
			source: 'Qlik Linter'
		});
		problems++;
	}

	return diagnostics;
}

