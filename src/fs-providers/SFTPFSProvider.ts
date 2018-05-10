import * as vscode from 'vscode';
import * as fs from 'fs';
import { Client } from 'ssh2';
import { getUserSetting, promptForPassword } from '../host';
import RemoteFileSystemProvider from '../core/RemoteFileSystemProvider';
import { ConnectClient, Connect } from '../core/ConnectManager';

function readfile(fspath) {
  return new Promise((resolve, reject) => {
    fs.readFile(fspath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(data);
    });
  });
}

function getType(stat) {
  if (stat.isDirectory()) {
    return vscode.FileType.Directory;
  } else if (stat.isFile()) {
    return vscode.FileType.File;
  } else if (stat.isSymbolicLink()) {
    return vscode.FileType.SymbolicLink;
  } else {
    return vscode.FileType.Unknown;
  }
}

export default class SFTPFSProvider extends RemoteFileSystemProvider {
  private _client: any = new Client();

  async connect(remote): Promise<ConnectClient> {
    // tslint:disable triple-equals
    const shouldPromptForPass =
      remote.password == undefined &&
      remote.agent == undefined &&
      remote.privateKeyPath == undefined;
    // tslint:enable

    if (shouldPromptForPass) {
      // modify remote so we don't need later
      remote.password = await promptForPassword('Enter your password');
    }

    // explict compare to true, cause we want to distinct between string and true
    if (remote.passphrase === true) {
      // modify remote so we don't need later
      remote.passphrase = await promptForPassword('Enter your passphrase');
    }

    const { interactiveAuth, connectTimeout, privateKeyPath, ...connectOption } = remote;

    connectOption.tryKeyboard = interactiveAuth;
    connectOption.readyTimeout = connectTimeout;
    connectOption.keepaliveInterval = 1000 * 30;
    connectOption.keepaliveCountMax = 2;

    if (privateKeyPath) {
      connectOption.privateKey = await readfile(privateKeyPath);
    }

    return this._connectClient(connectOption);
  }

  isFileExist(uri: vscode.Uri): Thenable<boolean> {
    return Promise.resolve(false);
  }

  $stat(uri: vscode.Uri, client: ConnectClient): Thenable<vscode.FileStat> {
    return new Promise((resolve, reject) => {
      client.lstat(uri.path, (err, stat) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          type: getType(stat),
          ctime: stat.mtime,
          mtime: stat.mtime,
          size: stat.size,
        });
      });
    });
  }

  $readDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<[string, vscode.FileType][]> {
    console.log('$readDirectory', uri.path);
    return new Promise((resolve, reject) => {
      client.readdir(uri.path, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(stats.map(stat => [stat.filename, getType(stat.attrs)]));
      });
    });
  }

  $createDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<void> {
    console.log('$createDirectory', uri.path);
    return new Promise<void>((resolve, reject) => {
      client.mkdir(uri.path, err => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  $readFile(uri: vscode.Uri): Thenable<Uint8Array> {
    console.log('$readFile', uri.path);
    return Promise.resolve(new Uint8Array(0));
  }

  $createFile(uri: vscode.Uri): Thenable<void> {
    console.log('$createFile', uri.path);
    return Promise.resolve();
  }

  $writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void> {
    console.log('$writeFile', uri.path);
    return Promise.resolve();
  }

  $delete(uri: vscode.Uri, options: { recursive: boolean }): Thenable<void> {
    console.log('$delete', uri.path);
    return Promise.resolve();
  }

  $rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Thenable<void> {
    console.log('$delete', oldUri.path, newUri.path);
    return Promise.resolve();
  }

  private async _connectClient(option): Promise<ConnectClient> {
    return new Promise<ConnectClient>((resolve, reject) => {
      this._client
        .on('ready', () => {
          this._client.sftp((err, sftp) => {
            if (err) {
              reject(err);
            }

            sftp.onEnd = cb => {
              return this._client.on('end', cb);
            };
            sftp.end = () => {
              return this._client.end();
            };
            resolve(sftp);
          });
        })
        .on('error', err => {
          reject(err);
        })
        .connect(option);
    });
  }
}
