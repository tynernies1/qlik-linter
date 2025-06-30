/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	SemanticTokensBuilder,
	SemanticTokensLegend,
	type DocumentDiagnosticReport,
	CodeAction
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import {
	getKeywordUppercaseDiagnostics
} from './linter/keywordsUppercase';

import * as fs from 'fs';
import * as path from 'path';
import { getUppercaseQuickfix } from './quickFix/keywordToUppercase';
import { multilineCommentToken } from './semanicToken/multilineCommentToken';
import { ITokenData } from './semanicToken/ITokenData';
import { QlikLanguageServerSettings } from './configuration/QlikLanguageServerSettings';
import { semanticTokenFinder } from './semanicToken/semanticTokenFinder';
import { getAsAlignmentDiagnostics } from './linter/asAlingment';
import { getParenthesisDiagnostics } from './linter/parenthesesMatch';

let qlikKeywords: string[] = [];

try {
	const csvPath = path.resolve(__dirname, 'qlik_keywords.csv');
	const csvData = fs.readFileSync(csvPath, 'utf8');
	qlikKeywords = csvData.split(/\r?\n/).filter(Boolean);
} catch (error) {
	console.error("Failed to load Qlik keywords CSV:", error);
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

const tokenTypes = ["keyword", "variable", "function", "string", "comment", "class", "parameter", "property", "decorator", "operator"];
const tokenModifiers: string[] = [];

const legend: SemanticTokensLegend = { tokenTypes, tokenModifiers };

connection.onInitialize((params: InitializeParams) => {

	console.log("[Server] onInitialize");
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			semanticTokensProvider: {
				legend,
				range: false, // Change to true if you want partial updates
				full: true
			},
			codeActionProvider: true
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: QlikLanguageServerSettings = {
	maxNumberOfProblems: 1000,
	linter: {
		active: true,
		keywordsUppercase: true,
		asAlingment: true,
		parenthesesMatch: true
	}
};
let globalSettings: QlikLanguageServerSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<QlikLanguageServerSettings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = (
			(change.settings.qliklanguageServer || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<QlikLanguageServerSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'qliklanguageServer'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	const settings = await getDocumentSettings(textDocument.uri);
	const text = textDocument.getText();

	if (settings.linter.active === false) {
		// linter is disabled
		return [];
	}

	// Collect diagnostics from all checkers
	const diagnostics: Diagnostic[] = [];

	if (settings.linter.keywordsUppercase) {
		diagnostics.push(...getKeywordUppercaseDiagnostics(text, textDocument, settings.maxNumberOfProblems, qlikKeywords));
	}

	if (settings.linter.asAlingment) {
		diagnostics.push(...getAsAlignmentDiagnostics(text, textDocument, settings.maxNumberOfProblems));
	}
	// Add other diagnostic checks here in future, if needed
	if (settings.linter.parenthesesMatch) {
		diagnostics.push(...getParenthesisDiagnostics(text, textDocument, settings.maxNumberOfProblems));
	}
	return diagnostics;
}


// Add this handler after your other connection handlers
connection.onCodeAction(async (params) => {

	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}

	const diagnostics = params.context.diagnostics;
	const text = document.getText();
	const codeActions: CodeAction[] = [];

	getUppercaseQuickfix(
		diagnostics,
		text,
		params,
		codeActions
	);

	return codeActions;
});

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// Define a list of keywords for QVS
		const keywords = [
			"LOAD", "SELECT", "FROM", "WHERE", "JOIN", "GROUP BY", "ORDER BY", "SET", "LET"
		];

		// Convert keywords to CompletionItems
		return keywords.map((keyword, index) => ({
			label: keyword,
			kind: CompletionItemKind.Keyword,
			data: index
		}));
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.kind === CompletionItemKind.Keyword) {
			item.detail = 'QlikScript details';
			item.documentation = 'QlikScript documentation';
		}
		return item;
	}
);

// Function to compute semantic tokens
connection.onRequest("textDocument/semanticTokens/full", async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) { return null; }

	const builder = new SemanticTokensBuilder();
	const text = document.getText();
	const lines = text
		.replace(/\r(?!\n)/g, '\r\n')    // lone \r → \r\n
		.replace(/(?<!\r)\n/g, '\r\n')  // lone \n → \r\n
		.split("\n");

	const tokenData: ITokenData[] = [];

	tokenData.push(...multilineCommentToken(text, document, lines));
	tokenData.push(...semanticTokenFinder(lines, qlikKeywords));

	// important to sort the tokens by line number, negative offset is not allowed
	tokenData.sort((a, b) => a.line - b.line);

	tokenData.forEach(({ line, startChar, length, tokenType }) => {
		builder.push(line, startChar, length, tokenTypes.indexOf(tokenType), 0);
	});

	const result = builder.build();

	return result;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

