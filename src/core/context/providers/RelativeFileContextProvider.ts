import { glob } from 'glob';
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

    let firstMatch: string | undefined;
    const workspaceDirs = await extras.ide.getWorkspaceDirs();
    for (const rootDir of workspaceDirs) {
      const matches = await glob(`**/${query}`, {
        cwd: rootDir,
        signal: AbortSignal.timeout(1000),
      });
      if (matches.length > 0) {
        firstMatch = matches[0];
        break;
      }
    }
    if (!firstMatch) { return []; }
    const content = await extras.ide.readFile(firstMatch);
    return [{
      name: query.split(/[\\/]/).pop() ?? query,
      description: firstMatch,
      content: `\`\`\`${query}\n${content}\n\`\`\``,
      uri: {
        type: 'file',
        value: firstMatch,
      },
    }];
  }
}

export default RelativeFileContextProvider;
