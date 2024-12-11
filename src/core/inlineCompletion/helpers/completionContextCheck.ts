import * as vscode from 'vscode';

// This can happen when the user has some content on the editor
// but it does not match the current popup item
export function currentEditorContentMatchesPopupItem(
  document: vscode.TextDocument,
  context: vscode.InlineCompletionContext
): boolean {
  if (context.selectedCompletionInfo) {
    const currentText = document.getText(context.selectedCompletionInfo.range);
    const selectedText = context.selectedCompletionInfo.text;

    if (!selectedText.startsWith(currentText)) {
      return false;
    }
  }
  return true;
}
