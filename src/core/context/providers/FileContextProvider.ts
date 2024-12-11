import { walkDir } from '../../utilities/dir';
import { groupByLastNPathParts, getBasename, getUniqueFilePath } from '../../utilities/path';
import { BaseContextProvider } from './BaseContextProvider';
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  ContextSubmenuItem,
  LoadSubmenuItemsArgs,
} from './types';

const MAX_SUBMENU_ITEMS = 10_000;

class FileContextProvider extends BaseContextProvider {
  static override description: ContextProviderDescription = {
    title: 'file',
    displayTitle: 'Files',
    description: 'Type to search',
    type: 'submenu',
  };

  async getContextItems(query: string, extras: ContextProviderExtras): Promise<ContextItem[]> {
    query = query.trim();
    const content = await extras.ide.readFile(query);
    return [
      {
        name: query.split(/[\\/]/).pop() ?? query,
        description: query,
        content: `\`\`\`${query}\n${content}\n\`\`\``,
        uri: {
          type: 'file',
          value: query,
        },
      },
    ];
  }

  override async loadSubmenuItems(args: LoadSubmenuItemsArgs): Promise<ContextSubmenuItem[]> {
    const workspaceDirs = await args.ide.getWorkspaceDirs();
    const results = await Promise.all(
      workspaceDirs.map((dir) => {
        return walkDir(dir, args.ide);
      })
    );
    const files = results.flat().slice(-MAX_SUBMENU_ITEMS);
    const fileGroups = groupByLastNPathParts(files, 2);

    return files.map((file) => {
      return {
        id: file,
        title: getBasename(file),
        description: getUniqueFilePath(file, fileGroups),
      };
    });
  }
}

export default FileContextProvider;
