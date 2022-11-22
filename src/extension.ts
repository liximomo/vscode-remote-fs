'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as upath from 'upath';
import { COMMAND_ADD_FOLDER_TO_WORKSPACE } from './constants';
import { getRemoteList, getExtensionSetting } from './core/config';
import buildURI from './helpers/buildURI';
import { addWorkspace } from './host';
import SFTPFSProvider from './fs-providers/SFTPFSProvider';
import FTPProvider from './fs-providers/FTPProvider';
import providerManager from './core/providerManager';

const DEFAULT_ROOTLABEL = '${folderName} — (Remote)';

function supplant(string, props) {
  let result = string.replace(/\${([^{}]*)}/g, (match, expr) => {
    const value = props[expr];
    return typeof value === 'string' || typeof value === 'number' ? value : match;
  });

  result = result.replace(/"{#([^{}]*)}"/g, (match, expr) => {
    const value = props[expr];
    return typeof value === 'string' || typeof value === 'number' ? value : match;
  });
  return result;
}

function registerCommand(
  context: vscode.ExtensionContext,
  name: string,
  callback: (args: any[]) => any,
  thisArg?: any
) {
  const disposable = vscode.commands.registerCommand(name, callback, thisArg);
  context.subscriptions.push(disposable);
}

function getRemote() {
  const remotes = getRemoteList();
  return vscode.window
    .showQuickPick(
      remotes.map(remote => {
        let description = `${remote.host}:${remote.port}`;
        if (remote.rootPath) {
          description += ` at ${remote.rootPath}`;
        }
        return {
          label: remote.name,
          description,
          remote,
        };
      }),
      {
        placeHolder: 'Please choose a remote',
      }
    )
    .then(selection => {
      if (!selection) {
        return;
      }

      return selection.remote;
    });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('sftp', providerManager.instance(SFTPFSProvider), {
      isCaseSensitive: true,
    })
  );

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('ftp', providerManager.instance(FTPProvider), {
      isCaseSensitive: true,
    })
  );

  registerCommand(context, COMMAND_ADD_FOLDER_TO_WORKSPACE, async () => {
    const extConfig = getExtensionSetting();
    const remote = await getRemote();
    if (!remote) {
      return;
    }

    const rootLabel = extConfig.get('rootLabel', DEFAULT_ROOTLABEL);
    const folderName = (remote.rootPath && upath.basename(remote.rootPath)) || '/';

    const label = remote.label || supplant(rootLabel, { name: remote.name, folderName });
    addWorkspace(buildURI(remote.scheme, remote.name), label);
  });
}

export function deactivate() {
  for (const fsProvider of providerManager.fses()) {
    fsProvider.destroy();
  }
}
