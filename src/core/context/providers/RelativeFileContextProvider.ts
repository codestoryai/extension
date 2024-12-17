import { glob } from 'glob';
import path from 'path';
import { BaseContextProvider } from './BaseContextProvider';
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
} from './types';


class RelativeFileContextProvider extends BaseContextProvider {
  static override description: ContextProviderDescription = {
    title: 'relative-file',
    displayTitle: 'Relative Files',
    description: 'Resolve a relative file path in the project',
    type: 'query',
  };

  async getContextItems(query: string, extras: ContextProviderExtras): Promise<ContextItem[]> {
    query = query.trim();
    if (!query) { return []; }
    console.log('will get relative files');
    const workspaceDirs = await extras.ide.getWorkspaceDirs();
    const fullPath = await matchPathToWorkspaceDirs(query, workspaceDirs);
    if (!fullPath) { return []; }
    const content = await extras.ide.readFile(fullPath);
    return [{
      name: query.split(/[\\/]/).pop() ?? query,
      description: fullPath,
      content: `\`\`\`${query}\n${content}\n\`\`\``,
      uri: {
        type: 'file',
        value: fullPath,
      },
    }];
  }
}

async function matchPathToWorkspaceDirs(query: string, workspaceDirs: string[]) {
  for (const rootDir of workspaceDirs) {
    const matches = await glob(`**/${query}`, {
      cwd: rootDir,
      signal: AbortSignal.timeout(1000),
    });
    if (matches.length > 0) {
      console.log('match', matches[0], path.join(rootDir, matches[0]));
      return path.join(rootDir, matches[0]);  // Create full path
    } else {
      return null;
    }
  }
  return null;
}

export default RelativeFileContextProvider;
