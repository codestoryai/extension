/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//  Copy keybindings.json and settings.json files
// cp ~/Library/Application\ Support/Code/User/keybindings.json ~/Library/Application\ Support/Aide/User
// cp ~/Library/Application\ Support/Code/User/settings.json ~/Library/Application\ Support/Aide/User

import { Logger } from 'winston';
import { commands, env, Uri, window } from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as process from 'process';
import * as path from 'path';
import { runCommandAsync } from './commandRunner';
import { get } from 'https';


type Architectures = typeof process.arch;
type ExtensionPlatorm = 'universal' | `${NodeJS.Platform}-${Architectures}`;

type VsixMetadata = {
	downloads: {
		[platform in ExtensionPlatorm]?: string
	};
};

export interface IProductConfiguration {
	updateUrl: string;
	commit: string;
	quality: string;
	dataFolderName: string;
	serverApplicationName?: string;
	serverDataFolderName?: string;
}


function getProductConfiguration(): IProductConfiguration {
	const content = fs.readFileSync(path.join(env.appRoot, 'product.json')).toString();
	return JSON.parse(content) as IProductConfiguration;
}

export const copySettings = async (workingDirectory: string, logger: Logger) => {

	const { dataFolderName } = getProductConfiguration();

	window.showInformationMessage('Copying settings from vscode to aide');
	// We want to execute the cp command above
	// First we want to ensure that ~/.aide exists

	// if the platform is windows we have to gate is specially
	if (os.platform() === 'win32') {
		// Now we write custom code to make this work
		const appDataPath = process.env.APPDATA;
		const userProfilePath = process.env.USERPROFILE;
		try {
			if (appDataPath !== undefined) {
				// copy the settings.json
				const settingsPath = path.join(appDataPath, 'Code', 'User', 'settings.json');
				const destinationPath = path.join(appDataPath, 'Aide', 'User', 'settings.json');
				if (fs.existsSync(settingsPath)) {
					fs.copyFileSync(settingsPath, destinationPath);
				}
			}
		} catch (exception) {
			// console.log('error when copying user settings.json', exception);
		}
		try {
			if (appDataPath !== undefined) {
				// copy the keybindings.json
				const keybindingsPath = path.join(appDataPath, 'Code', 'User', 'keybindings.json');
				const destinationKeybindingsPath = path.join(appDataPath, 'Aide', 'User', 'keybindings.json');
				if (fs.existsSync(keybindingsPath)) {
					fs.copyFileSync(keybindingsPath, destinationKeybindingsPath);
				}
			}
		} catch (exception) {
			// console.log('error when copying keybindings.json', exception);
		}

		// Now we copy the extensions
		try {
			if (userProfilePath) {
				const keybindingsFolder = path.join(userProfilePath, '.vscode', 'extensions');
				const destinationFolder = path.join(userProfilePath, dataFolderName, 'extensions');
				copyFiles(keybindingsFolder, destinationFolder);
			}
		} catch (exception) {
			// console.log('error when copying extensions', exception);
		}
		return;
	}

	const homeDir = os.homedir();
	const { exitCode: exitCodeMkdir } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/${dataFolderName}`]);
	if (exitCodeMkdir !== 0) {
		window.showErrorMessage('Error creating ~/.aide directory');
		logger.error('Error creating ~/.aide directory');
		return;
	}

	// EXTENSIONS

	const srcDir = path.join(homeDir, '.vscode/extensions');
	const destDir = path.join(homeDir, `${dataFolderName}/extensions`);

	// Get all subdirectories in the source folder
	const allDirs = fs.readdirSync(srcDir).filter(file => {
		const fullPath = path.join(srcDir, file);
		return fs.statSync(fullPath).isDirectory();
	});


	window.showInformationMessage(`Installing extensions from OpenVSX...`);

	for (const dir of allDirs) {

		const namespaceAndExt = getNamesapceAndExtension(dir);
		if (!namespaceAndExt) {
			console.error(`Failed to copy directory: ${dir}`);
			window.showErrorMessage(`Error copying directory "${dir}", it does not match the expected format`);
			continue;
		}
		const [namespace, extension] = namespaceAndExt;

		let openVSXExtensionPath: string | undefined;
		try {
			const vsixResponse = await fetch(`https://open-vsx.org/api/${namespace}/${extension}`);
			if (!vsixResponse.ok) {
				throw new Error(`Failed to fetch OpenVSX metadata for ${namespace}.${extension}`);
			}
			const vsixMetadata = await vsixResponse.json() as VsixMetadata;
			if (!vsixMetadata) {
				throw new Error(`No OpenVSX metadata found for ${namespace}.${extension}`);
			}

			const tempFile = `${namespace}.${extension}.vsix`;
			const platform = `${os.platform()}-${os.arch()}` as ExtensionPlatorm;
			if (vsixMetadata.downloads.universal) {
				console.log(`Found universal download URL for ${namespace}.${extension}`);
				openVSXExtensionPath = await downloadFileToFolder(vsixMetadata.downloads.universal, destDir, tempFile);
			} else if (vsixMetadata.downloads[platform]) {
				console.log(`Found platform-specific download URL for ${namespace}.${extension} on ${platform}`);
				const platformSpecificDownloadUrl = vsixMetadata.downloads[platform];
				openVSXExtensionPath = await downloadFileToFolder(platformSpecificDownloadUrl, destDir, tempFile);
			}
			if (!openVSXExtensionPath) {
				throw new Error(`Failed to find a suitabile download URL for the ${namespace}.${extension} extension for ${os.platform()} and ${os.arch()}`);
			}
			await commands.executeCommand('workbench.extensions.command.installFromVSIX', Uri.parse(openVSXExtensionPath));
			console.log(`Successfully installed ${namespace}.${extension} from OpenVSX`);
		} catch (error) {
			console.error(`Failed to install from VSX: ${namespace}.${extension}. Error: ${error.message}`);
		} finally {
			if (openVSXExtensionPath) {
				fs.unlinkSync(openVSXExtensionPath);
				console.log(`Deleted installation file: ${openVSXExtensionPath}`);
			}
		}
	}

	window.showInformationMessage(`Completed installing extensions from OpenVSX`);

	// Now we can copy over keybindings.json and settings.json
	// We want to ensure that ~/Library/Application\\ Support/Aide/User exists
	// of if its on linux it might be on path: ~/.config/aide
	if (os.platform() === 'linux') {
		try {
			const { exitCode: exitCodeMkdirAideUser } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/.config/Code/User/`]);
			if (exitCodeMkdirAideUser !== 0) {
				window.showErrorMessage(`Error creating ${homeDir}/.config/Code/User/ directory`);
				logger.error(`Error creating ${homeDir}/.config/Code/User/ directory`);
			}
		} catch (exception) {
			// console.log('error when creating ~/.config/Code/User/ directory', exception);
		}
		try {
			const outputKeybindings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/.config/Code/User/keybindings.json`, `${homeDir}/.config/Aide/User`]);
			if (outputKeybindings.exitCode !== 0) {
				window.showErrorMessage('Error copying keybindings from vscode to aide');
				logger.error('Error copying keybindings from vscode to aide');
			}
		} catch (exception) {
			// console.log('error when copying keybindings.json', exception);
		}
		try {
			const outputSettings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/.config/Code/User/settings.json`, `${homeDir}/.config/Aide/User`]);
			if (outputSettings.exitCode !== 0) {
				window.showErrorMessage('Error copying settings from vscode to aide');
				logger.error('Error copying settings from vscode to aide');
			}
		} catch (exception) {
			// console.log('error when copying settings.json', exception);
		}
		window.showInformationMessage('Copied settings from vscode to aide');
		logger.info('Reload your window with Cmd + Shift + P -> Developer: Reload Window');
		return;
	} else if (os.platform() === 'darwin') {
		try {
			const { exitCode: exitCodeMkdirAideUser } = await runCommandAsync(workingDirectory, 'mkdir', ['-p', `${homeDir}/Library/Application Support/Aide/User`]);
			if (exitCodeMkdirAideUser !== 0) {
				window.showErrorMessage('Error creating ~/Library/Application Support/Aide/User directory');
				logger.error('Error creating ~/Library/Application Support/Aide/User directory');
			}
		} catch (exception) {
			// console.log('error when creating ~/Library/Application Support/Aide/User directory', exception);
		}
		try {
			const outputKeybindings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/Library/Application Support/Code/User/keybindings.json`, `${homeDir}/Library/Application Support/Aide/User`]);
			if (outputKeybindings.exitCode !== 0) {
				window.showErrorMessage('Error copying keybindings from vscode to aide');
				logger.error('Error copying keybindings from vscode to aide');
			}
		} catch (exception) {
			// console.log('error when copying keybindings.json', exception);
		}
		try {
			const outputSettings = await runCommandAsync(workingDirectory, 'cp', [`${homeDir}/Library/Application Support/Code/User/settings.json`, `${homeDir}/Library/Application Support/Aide/User`]);
			if (outputSettings.exitCode !== 0) {
				window.showErrorMessage('Error copying settings from vscode to aide');
				logger.error('Error copying settings from vscode to aide');
			}
		} catch (exception) {
			// console.log('error when copying settings.json', exception);
		}
		window.showInformationMessage('Copied settings from vscode to aide');
		logger.info('Reload your window with Cmd + Shift + P -> Developer: Reload Window');
		return;
	}
};

function getNamesapceAndExtension(extensionFolderName: string) {
	// Define a regular expression to match the "[spacename].[extension]-[version]" pattern
	const regex = /([a-zA-Z0-9\-]+)\.([a-zA-Z0-9\-]+)-(\d+\.\d+\.\d+)/;

	// Apply the regex to the folder name
	const match = extensionFolderName.match(regex);

	// If a match is found, return it in the desired format
	if (match) {
		const spaceName = match[1];
		const extension = match[2];
		const version = match[3];
		return [spaceName, extension, version];
	}

	// If no match is found, return null
	return null;
}

function copyFiles(srcDirectory: string, destDirectory: string) {
	fs.readdirSync(srcDirectory).forEach(file => {
		const srcFile = path.join(srcDirectory, file);
		const destFile = path.join(destDirectory, file);

		const stat = fs.statSync(srcFile);
		if (stat.isDirectory()) {
			fs.mkdirSync(destFile, { recursive: true });
			copyFiles(srcFile, destFile);
		} else {
			fs.copyFileSync(srcFile, destFile);
		}
	});
}


function downloadFileToFolder(fileUrl: string, downloadFolder: string, fileName: string, redirectCount = 0): Promise<string> {
	return new Promise((resolve, reject) => {

		if (redirectCount > 5) {
			reject(new Error('Too many redirects'));
			return;
		}

		const filePath = path.join(downloadFolder, fileName);

		// Create the folder if it doesn't exist
		if (!fs.existsSync(downloadFolder)) {
			fs.mkdirSync(downloadFolder, { recursive: true });
		}

		const file = fs.createWriteStream(filePath);


		get(fileUrl, (response) => {

			if (response.statusCode === 302) {
				const location = response.headers.location;
				if (!location) {
					reject(new Error('Redirect location not provided'));
					return;
				}
				downloadFileToFolder(location, downloadFolder, fileName, redirectCount + 1).then(resolve, reject);
				return;
			}

			if (response.statusCode !== 200) {
				reject(new Error(`Failed to download file: ${response.statusCode}`));
				return;
			}

			response.pipe(file);

			file.on('finish', () => {
				file.close(() => {
					console.log(`Downloaded file: ${filePath}`);
					resolve(filePath);
				});
			});
		}).on('error', (err) => {
			fs.unlinkSync(filePath); // Delete the file if an error occurs
			reject(err);
		});
	});
}
