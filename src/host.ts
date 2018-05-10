import * as vscode from 'vscode';
import { EXTENSION_NAME } from './constants';

export function showErrorMessage(message: string | Error, ...args: any[]) {
  const errorStr = message instanceof Error ? message.message : message;
  return vscode.window.showErrorMessage(`[${EXTENSION_NAME}] ${errorStr}`, ...args);
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

export function promptForPassword(prompt: string): Promise<string | null> {
  return vscode.window.showInputBox({
    ignoreFocusOut: true,
    password: true,
    prompt: `${EXTENSION_NAME}: ${prompt}`,
  }) as Promise<string | null>;
}
