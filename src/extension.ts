'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as upath from 'upath';
import { COMMAND_OPEN, COMMAND_ADD_FOLDER_TO_WORKSPACE } from './constants';
import { getRemoteList } from './core/config';
import buildURI from './helpers/buildURI';
import { openFolder } from './host';
import SFTPFSProvider from './fs-providers/SFTPFSProvider';
import providerManager from './core/providerManager';

function registerCommand(
  context: vscode.ExtensionContext,
  name: string,
  callback: (args: any[]) => any,
  thisArg?: any
) {
  const disposable = vscode.commands.registerCommand(name, callback, thisArg);
  context.subscriptions.push(disposable);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('sftp', providerManager.instance(SFTPFSProvider), {
      isCaseSensitive: true,
    })
  );

  registerCommand(context, COMMAND_OPEN, () => {
    const remotes = getRemoteList();
    vscode.window
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

        const remote = selection.remote;
        const name = remote.rootPath ? upath.basename(remote.rootPath) : remote.name;
        openFolder(buildURI(remote.scheme, remote.name), `${name} (Remote)`);
      });
  });
  registerCommand(context, COMMAND_ADD_FOLDER_TO_WORKSPACE, () => {
    console.log('COMMAND_ADD_FOLDER_TO_WORKSPACE');
  });
}

export function deactivate() {
  for (const fsProvider of providerManager.fses()) {
    fsProvider.destroy();
  }
}
