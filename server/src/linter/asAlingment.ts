import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-languageserver';



export function getAsAlignmentDiagnostics(
	text: string,
	textDocument: TextDocument,
	maxProblems: number
): Diagnostic[] {

	let problems = 0;

	const diagnostics: Diagnostic[] = [];

	const lines = text
		.replace(/\r(?!\n)/g, '\r\n')    // lone \r → \r\n
		.replace(/(?<!\r)\n/g, '\r\n')  // lone \n → \r\n
		.split("\n");

	const loadRegex = /\bload\s/gi;
	const fromResidentRegex = /(from|resident)\s/gi;
	const asRegex = /[\s|"]{1}?AS\s/gi;

	let inLoad = false;
	let asIndex = -1;
	let documentIndex = 0;

	for (const line of lines) {

		if (problems >= maxProblems) {
			break; // Stop if we reached the maximum number of problems
		}

		const matchLoad = line.match(loadRegex);
		if (matchLoad) {
			console.log(`Found LOAD statement at index ${documentIndex}`);
			inLoad = true;
		}

		if (!inLoad) {
			documentIndex += line.length + 1; // +1 for the newline character
			continue; // Skip lines that are not in a LOAD statement
		}

		const asMatch = line.match(asRegex);
		if (asMatch) {
			if (asIndex === -1) {
				asIndex = line.indexOf(asMatch[0]);
			}
			else if (asIndex !== -1 && asIndex != line.indexOf(asMatch[0])) {
				// If AS is not aligned with the first AS in the LOAD statement
				const diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Warning,
					range: {
						start: textDocument.positionAt(documentIndex + line.indexOf(asMatch[0]) + 1),
						end: textDocument.positionAt(documentIndex + line.indexOf(asMatch[0]) + 3)
					},
					message: `As should be alinged`,
					source: 'Qlik Linter'
				};
				diagnostics.push(diagnostic);
				problems++;
			}
		}

		const matchFrom = line.match(fromResidentRegex);
		if (matchFrom) {
			asIndex = -1; // Reset if FROM or RESIDENT found
			inLoad = false;
		}

		documentIndex += line.length + 1; // +1 for the newline character
	}

	return diagnostics;
}