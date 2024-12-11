/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CodeSymbolInformation } from './types';


// function isSymbolInformationArray(symbols: SymbolInformation[] | DocumentSymbol[]): symbols is SymbolInformation[] {
// 	// Assuming SymbolInformation has a unique property 'location'
// 	return (symbols.length > 0 && 'containerName' in symbols[0]);
// }



export const getCodeLocationPath = (directoryPath: string, filePath: string): string => {
	// Parse the filePath to get an object that includes properties like root, dir, base, ext and name
	const parsedFilePath = path.parse(filePath);

	// Remove the extension of the file
	const filePathWithoutExt = path.join(parsedFilePath.dir, parsedFilePath.name);

	// Find the relative path from directoryPath to filePathWithoutExt
	const relativePath = path.relative(directoryPath, filePathWithoutExt);

	// Replace backslashes with forward slashes to make it work consistently across different platforms (Windows uses backslashes)
	return relativePath.replace(/\//g, '.');
};

export const getSymbolsFromDocumentUsingLSP = async (
	filePath: string,
	languageId: string,
	workingDirectory: string,
): Promise<CodeSymbolInformation[]> => {
	console.log(filePath, languageId, workingDirectory);
	return [];
};