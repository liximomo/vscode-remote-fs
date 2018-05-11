import * as vscode from 'vscode';
import { EXTENSION_NAME } from './constants';

export function showErrorMessage(message: string | Error, ...args: any[]) {
  const errorStr = message instanceof Error ? message.message : message;
  return vscode.window.showErrorMessage(errorStr, ...args);
}

export function getUserSetting() {
  return vscode.workspace.getConfiguration('remotefs');
}

export function openWorkspace(uri: vscode.Uri, name?) {
  return vscode.workspace.updateWorkspaceFolders(0, 1, { uri, name });
}

export function addWorkspace(uri: vscode.Uri, name?) {
  return vscode.workspace.updateWorkspaceFolders(0, 0, { uri, name });
}

export function removeWorkspace(uri: vscode.Uri) {
  const { workspaceFolders, getWorkspaceFolder } = vscode.workspace;
  const workspaceFolder = getWorkspaceFolder(uri);
  // const index = workspaceFolders.findIndex(wf => {
  //   const wfUri = wf.uri;

  //   return (
  //     wfUri.scheme === uri.scheme && wfUri.authority === uri.authority && wfUri.path === uri.path
  //   );
  // });

  if (!workspaceFolder) {
    return;
  }

  return vscode.workspace.updateWorkspaceFolders(workspaceFolder.index, 1);
}

export function promptForPassword(prompt: string): Promise<string | null> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    password: true,
    prompt: `${EXTENSION_NAME}: ${prompt}`,
  }) as Promise<string | null>;
}
