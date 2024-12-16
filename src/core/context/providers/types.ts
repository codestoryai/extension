import { IDE } from "../../..";

export type ContextItemUriTypes = "file" | "url";

export interface ContextItemUri {
    type: ContextItemUriTypes;
    value: string;
}

export interface ContextItem {
    content: string;
    name: string;
    description: string;
    editing?: boolean;
    editable?: boolean;
    icon?: string;
    uri?: ContextItemUri;
}

export interface ContextProviderExtras {
    ide: IDE;
}

export type FetchFunction = (url: string | URL, init?: any) => Promise<any>;

export interface LoadSubmenuItemsArgs {
    ide: IDE;
    fetch: FetchFunction;
}

type ContextProviderName = "file" | "code" | "relative-file";
type ContextProviderType = "normal" | "query" | "submenu";

export interface ContextProviderDescription {
    title: ContextProviderName;
    displayTitle: string;
    description: string;
    renderInlineAs?: string;
    type: ContextProviderType;
    dependsOnIndexing?: boolean;
}

export interface IContextProvider {
    get description(): ContextProviderDescription;

    getContextItems(
        query: string,
        extras: ContextProviderExtras,
    ): Promise<ContextItem[]>;

    loadSubmenuItems(args: LoadSubmenuItemsArgs): Promise<ContextSubmenuItem[]>
}

export interface ContextSubmenuItem {
    id: string;
    title: string;
    description: string;
    icon?: string;
    metadata?: any;
}
