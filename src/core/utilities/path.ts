const SEP_REGEX = /[\\/]/;

export function getBasename(filepath: string): string {
    return filepath.split(SEP_REGEX).pop() ?? "";
}

export function getLastNPathParts(filepath: string, n: number): string {
    if (n <= 0) {
        return "";
    }
    return filepath.split(SEP_REGEX).slice(-n).join("/");
}

export function groupByLastNPathParts(
    filepaths: string[],
    n: number,
): Record<string, string[]> {
    return filepaths.reduce(
        (groups, item) => {
            const lastNParts = getLastNPathParts(item, n);
            if (!groups[lastNParts]) {
                groups[lastNParts] = [];
            }
            groups[lastNParts].push(item);
            return groups;
        },
        {} as Record<string, string[]>,
    );
}

export function getUniqueFilePath(
    item: string,
    itemGroups: Record<string, string[]>,
): string {
    const lastTwoParts = getLastNPathParts(item, 2);
    const group = itemGroups[lastTwoParts];

    let n = 2;
    if (group.length > 1) {
        while (
            group.some(
                (otherItem) =>
                    otherItem !== item &&
                    getLastNPathParts(otherItem, n) === getLastNPathParts(item, n),
            )
        ) {
            n++;
        }
    }

    return getLastNPathParts(item, n);
}
