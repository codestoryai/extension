import { ContextItem, ContextProviderDescription, ContextProviderExtras, ContextSubmenuItem, IContextProvider, LoadSubmenuItemsArgs } from "./types";

export abstract class BaseContextProvider implements IContextProvider {
    options: { [key: string]: any };

    constructor(options: { [key: string]: any }) {
        this.options = options;
    }

    static description: ContextProviderDescription;

    get description(): ContextProviderDescription {
        return (this.constructor as typeof BaseContextProvider).description;
    }

    abstract getContextItems(
        query: string,
        extras: ContextProviderExtras,
    ): Promise<ContextItem[]>;

    async loadSubmenuItems(
        _args: LoadSubmenuItemsArgs,
    ): Promise<ContextSubmenuItem[]> {
        return [];
    }
}
