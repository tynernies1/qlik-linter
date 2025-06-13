import { Diagnostic, DiagnosticSeverity, TextDocument, Range } from 'vscode-languageserver';

function getCommentRanges(text: string): { start: number; end: number }[] {
	const ranges: { start: number; end: number }[] = [];

	const singleLineCommentRegex = /\/\/.*/g;
	const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;

	let match: RegExpExecArray | null;

	while ((match = singleLineCommentRegex.exec(text)) !== null) {
		const start = match.index;
		const end = match.index + match[0].length;
		ranges.push({ start, end });
	}

	while ((match = multiLineCommentRegex.exec(text)) !== null) {
		const start = match.index;
		const end = match.index + match[0].length;
		ranges.push({ start, end });
	}

	return ranges;
}

function isInComment(offset: number, commentRanges: { start: number; end: number }[]): boolean {
	return commentRanges.some(range => offset >= range.start && offset < range.end);
}

export function getLowercaseKeywordDiagnostics(
	text: string,
	textDocument: TextDocument,
	maxProblems: number,
	qlikKeywords: string[]
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const keywordRegex = new RegExp(`\\b(${qlikKeywords.join('|')})\\b`, 'gi');

	const commentRanges = getCommentRanges(text);
	let match: RegExpExecArray | null;
	let problems = 0;

	while ((match = keywordRegex.exec(text)) !== null && problems < maxProblems) {
		const keyword = match[0];
		const index = match.index;

		// Skip if inside a comment
		if (isInComment(index, commentRanges)) {
			continue;
		}

		if (keyword !== keyword.toUpperCase()) {
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: {
					start: textDocument.positionAt(index),
					end: textDocument.positionAt(index + keyword.length)
				},
				message: `Qlik keyword "${keyword}" should be uppercase.`,
				source: 'Qlik Linter'
			};
			diagnostics.push(diagnostic);
			problems++;
		}
	}

	return diagnostics;
}
