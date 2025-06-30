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

	let parenStack: { char: string; pos: number }[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		for (let j = 0; j < line.length; j++) {
			const char = line[j];

			if (char === '(') {
				parenStack.push({ char, pos: documentIndex + j });
			} else if (char === ')') {
				const last = parenStack.pop();
				if (!last || last.char !== '(') {
					if (problems >= maxProblems) break;

					const diagnostic: Diagnostic = {
						severity: DiagnosticSeverity.Error,
						range: {
							start: textDocument.positionAt(documentIndex + j),
							end: textDocument.positionAt(documentIndex + j + 1),
						},
						message: 'Unmatched closing parenthesis `)`',
						source: 'Qlik Linter'
					};
					diagnostics.push(diagnostic);
					problems++;
				}
			}
		}

		documentIndex += line.length + 1; // +1 for newline
	}

	// Handle any unmatched opening parentheses
	for (const unmatched of parenStack) {
		if (problems >= maxProblems) break;

		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: {
				start: textDocument.positionAt(unmatched.pos),
				end: textDocument.positionAt(unmatched.pos + 1),
			},
			message: 'Unmatched opening parenthesis `(`',
			source: 'Qlik Linter'
		};
		diagnostics.push(diagnostic);
		problems++;
	}

	return diagnostics;
}
