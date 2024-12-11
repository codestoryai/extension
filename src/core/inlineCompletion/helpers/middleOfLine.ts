import * as vscode from 'vscode';

export function isMiddleOfLine(
  doc: vscode.TextDocument,
  pos: vscode.Position
): boolean | undefined {
  const hasSuffixOnLine = 0 !== doc.lineAt(pos).text.substr(pos.character).length;

  const isSuffixIgnorable = (function (pos, doc) {
    const suffixOnLine = doc.lineAt(pos).text.substr(pos.character).trim();
    return /^\s*[)}\]"'`]*\s*[:{;,]?\s*$/.test(suffixOnLine);
  })(pos, doc);

  if (!hasSuffixOnLine || isSuffixIgnorable) {
    return hasSuffixOnLine && isSuffixIgnorable;
  }
  return undefined;
}
