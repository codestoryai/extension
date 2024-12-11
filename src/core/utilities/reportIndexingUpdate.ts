/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RepoRef, SideCarClient } from '../sidecar/client';
import { sidecarNotIndexRepository } from './sidecarUrl';


export function reportIndexingPercentage(sidecarClient: SideCarClient, currentRepo: RepoRef) {
	// Here we want to go along with the stream of messages we get back from the
	// sidecar for indexing and use that to report progress, we will assume that
	// there is just 1 repository
	// We should check if we have already indexed the repository, if that's the
	// case then we don't try to re-index again
	const shouldNotIndexRepository = sidecarNotIndexRepository();
	if (shouldNotIndexRepository) {
		return;
	}
	const title = 'Indexing progress';
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title,
			cancellable: false,
		},
		async (progress) => {
			const repoStatus = await sidecarClient.getRepoStatus();
			if (currentRepo.getRepresentation() in repoStatus.repo_map) {
				const repo = repoStatus.repo_map[currentRepo.getRepresentation()];
				if (typeof repo.sync_status === 'string') {
					if ('done' === repo.sync_status) {
						return;
					}
				}
			}
			const stream = await sidecarClient.getRepoSyncStatus();
			for await (const item of stream) {
				if ('ProgressEvent' in item) {
					const progressEvent = item.ProgressEvent.ev;
					if ('index_percent' in progressEvent) {
						const indexPercentage = progressEvent.index_percent;
						if (indexPercentage === 100) {
							progress.report({
								message: 'Finished indexing',
							});
							break;
						}
						progress.report({
							message: `Indexed ${progressEvent.index_percent}%`,
							increment: progressEvent.index_percent / 100,
						});
					}
				} else if ('KeepAlive' in item) {
				}
			}
		}
	);
}
