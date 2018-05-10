import * as vscode from 'vscode';

export function getUserSetting() {
  return vscode.workspace.getConfiguration('remotefs');
}

export function openFolder(uri: vscode.Uri, name?) {
  return vscode.workspace.updateWorkspaceFolders(0, 1, { uri, name });
}

export function addWorkspace(uri: vscode.Uri, name?) {
  return vscode.workspace.updateWorkspaceFolders(0, 0, { uri, name });
}

export function promptForPassword(prompt: string): Promise<string | null> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    password: true,
    prompt,
  }) as Promise<string | null>;
}
