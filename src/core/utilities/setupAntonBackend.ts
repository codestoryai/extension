/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// We are going to setup the anton backend here
import { workspace, window, ProgressLocation, extensions } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { promisify } from 'util';
import { spawn, exec, execFile } from 'child_process';
import * as os from 'os';
import { downloadFromGCPBucket, downloadUsingURL } from './gcpBucket';

export function getAideServerUrl() {
	// Passed in from launch.json
	if (process.env.CODESTORY_SERVER_URL) {
		return process.env.CODESTORY_SERVER_URL;
	}

	return (
		workspace.getConfiguration('aide').get<string>('pythonServerUrl') ||
		'http://127.0.0.1:42424'
	);
}

export async function runCommand(cmd: string): Promise<[string, string | undefined]> {
	let stdout = '';
	let stderr = '';
	try {
		const output = await promisify(exec)(cmd, {
			shell: process.platform === 'win32' ? 'powershell.exe' : undefined,
		});
		stdout = output.stdout;
		stderr = output.stderr;
	} catch (e: any) {
		stderr = e.stderr;
		stdout = e.stdout;
	}

	const stderrOrUndefined = stderr === '' ? undefined : stderr;
	return [stdout, stderrOrUndefined];
}

export function getExtensionVersion() {
	const extension = extensions.getExtension('codestory-ghost.codestoryai');
	return extension?.packageJSON.version || '';
}

async function checkServerRunning(serverUrl: string): Promise<boolean> {
	// Check if already running by calling /api/health
	try {
		const response = await axios.get(`${serverUrl}/api/health`);
		if (response.status === 200) {
			console.log('Aide python server already running');
			return true;
		} else {
			return false;
		}
	} catch (e) {
		return false;
	}
}

function killProcessOnPort(port: number) {
	// Find the process ID using lsof (this command is for macOS/Linux)
	exec(`lsof -i :${port} | grep LISTEN | awk '{print $2}'`, (error, stdout) => {
		if (error) {
			console.error(`exec error: ${error}`);
			return;
		}

		const pid = stdout.trim();

		if (pid) {
			// Kill the process
			execFile('kill', ['-9', `${pid}`], (killError) => {
				if (killError) {
					console.error(`Error killing process: ${killError}`);
					return;
				}
				console.log(`Killed process with PID: ${pid}`);
			});
		} else {
			console.log(`No process running on port ${port}`);
		}
	});
}

async function checkOrKillRunningServer(serverUrl: string): Promise<boolean> {
	const serverRunning = await checkServerRunning(serverUrl);
	if (serverRunning) {
		console.log('Killing server from old version of Aide');
		try {
			killProcessOnPort(42424);
		} catch (e: any) {
			if (!e.message.includes('Process doesn\'t exist')) {
				console.log('Failed to kill old server:', e);
			}
		}
	}
	return false;
}

function serverPath(extensionGlobalStorage: string): string {
	const sPath = path.join(extensionGlobalStorage, 'server');
	if (!fs.existsSync(sPath)) {
		fs.mkdirSync(sPath);
	}
	return sPath;
}

function serverVersionPath(extensionGlobalStorage: string): string {
	return path.join(serverPath(extensionGlobalStorage), 'server_version.txt');
}

export const writeConfigFileForAnton = async (
	workingDirectory: string,
	sessionId: string,
	preTestCommand: string[],
) => {
	const config = {
		'directory_location': workingDirectory,
		'session_id': sessionId,
		'pre_test_command': preTestCommand,
	};
	if (!fs.existsSync('/tmp/codestory')) {
		fs.mkdirSync('/tmp/codestory');
	}
	const configPath = path.join('/tmp/codestory', '.codestory.json');
	fs.writeFileSync(configPath, JSON.stringify(config));
};

export async function startAidePythonBackend(
	extensionBasePath: string,
	workingDirectory: string,
	uniqueUserId: string,
): Promise<string> {
	// Check vscode settings
	const serverUrl = getAideServerUrl();
	if (serverUrl !== 'http://127.0.0.1:42424') {
		console.log('CodeStory server is being run manually, skipping start');
		return 'http://127.0.0.1:42424';
	}

	// Check if server is already running
	if (await checkOrKillRunningServer(serverUrl)) {
		console.log('CodeStory server already running');
		return 'http://127.0.0.1:42424';
	}

	console.log('Starting Aide server right now');

	// Download the server executable
	const bucket = 'aide-binary';
	const fileName =
		os.platform() === 'win32'
			? 'windows/run.exe'
			: os.platform() === 'darwin'
				? 'mac/run'
				: 'linux/run';

	const destination = path.join(
		extensionBasePath,
		'server',
		'exe',
		`run${os.platform() === 'win32' ? '.exe' : ''}`
	);

	// First, check if the server is already downloaded
	let shouldDownload = true;
	console.log('Checking if server already downloaded');
	if (fs.existsSync(destination)) {
		// Check if the server is the correct version
		const serverVersion = fs.readFileSync(serverVersionPath(extensionBasePath), 'utf8');
		if (serverVersion === getExtensionVersion()) {
			// The current version is already up and running, no need to run
			console.log('Aide server already downloaded');
			shouldDownload = false;
		} else {
			fs.unlinkSync(destination);
		}
	}

	if (shouldDownload) {
		console.log('Downloading the aide server...');
		await window.withProgress(
			{
				location: ProgressLocation.SourceControl,
				title: 'Installing Aide server...',
				cancellable: false,
			},
			async () => {
				try {
					await downloadFromGCPBucket(bucket, fileName, destination);
				} catch (e) {
					console.log('Failed to download from GCP bucket, trying using URL: ', e);
					await downloadUsingURL(bucket, fileName, destination);
				}
			}
		);
	}

	console.log('Downloaded server executable at ', destination);
	// Get name of the corresponding executable for platform
	if (os.platform() === 'darwin') {
		// Add necessary permissions
		fs.chmodSync(destination, 0o7_5_5);
		await runCommand(`xattr -dr com.apple.quarantine ${destination}`);
	} else if (os.platform() === 'linux') {
		// Add necessary permissions
		fs.chmodSync(destination, 0o7_5_5);
	}

	// Validate that the file exists
	if (!fs.existsSync(destination)) {
		const errText = `- Failed to install Aide server.`;
		window.showErrorMessage(errText);
		throw new Error(errText);
	}

	// Run the executable
	console.log('Starting Aide server');
	let attempts = 0;
	const maxAttempts = 5;
	const delay = 1000; // Delay between each attempt in milliseconds

	const spawnChild = async () => {
		const retry = () => {
			attempts++;
			console.log(`Error caught (likely EBUSY). Retrying attempt ${attempts}...`);
			setTimeout(spawnChild, delay);
		};
		try {
			// NodeJS bug requires not using detached on Windows, otherwise windowsHide is ineffective
			// Otherwise, detach is preferable
			const windowsSettings = {
				windowsHide: true,
			};
			const macLinuxSettings = {
				detached: true,
				stdio: 'ignore',
			};
			const settings: any = os.platform() === 'win32' ? windowsSettings : macLinuxSettings;

			// Spawn the server
			// We need to write to /tmp/codestory/.codestory.json with the settings
			// blob so the server can start up
			try {
				await writeConfigFileForAnton(workingDirectory, uniqueUserId, []);
				console.log('Wrote config file for Anton');
			} catch (e) {
				console.error('Failed to write config file for Anton:', e);
			}
			const args = ['start-server', '--port', '42424'];
			const child = spawn(destination, args, settings);

			// Either unref to avoid zombie process, or listen to events because you can
			if (os.platform() === 'win32') {
				child.stdout.on('data', (data: any) => {
					console.log(`stdout: ${data}`);
				});
				child.stderr.on('data', (data: any) => {
					console.log(`stderr: ${data}`);
				});
				child.on('error', (err: any) => {
					if (attempts < maxAttempts) {
						retry();
					} else {
						console.error('Failed to start subprocess.', err);
					}
				});
				child.on('exit', (code: any, signal: any) => {
					console.log('Subprocess exited with code', code, signal);
				});
				child.on('close', (code: any, signal: any) => {
					console.log('Subprocess closed with code', code, signal);
				});
			} else {
				child.unref();
			}
		} catch (e: any) {
			console.log('Error starting server:', e);
			retry();
		}
	};

	await spawnChild();

	// Write the current version of vscode extension to a file called server_version.txt
	fs.writeFileSync(serverVersionPath(extensionBasePath), getExtensionVersion());
	return 'http://127.0.0.1:42424';
}


// void (async () => {
// 	startAidePythonBackend(
// 		'/Users/skcd/Desktop/',
// 		'/Users/skcd/scratch/anton/'
// 	);
// })();
