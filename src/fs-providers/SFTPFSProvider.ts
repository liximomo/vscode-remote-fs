import * as vscode from 'vscode';
import * as upath from 'upath';
import * as fs from 'fs';
import { Client } from 'ssh2';
import { promptForPassword } from '../host';
import RemoteFileSystemProvider from '../core/RemoteFileSystemProvider';
import { ConnectClient } from '../core/ConnectManager';

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

  isFileExist(uri: vscode.Uri, client: ConnectClient): Thenable<boolean> {
    return new Promise((resolve, reject) => {
      client.stat(uri.path, err => {
        if (err) {
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
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

  async $readFile(uri: vscode.Uri, client: ConnectClient): Promise<Uint8Array> {
    const stat = await this.$stat(uri, client);

    if (stat.type === vscode.FileType.SymbolicLink) {
      return this._readLink(uri, client);
    }

    return this._readFile(uri, client);
  }

  $createFile(uri: vscode.Uri, client: ConnectClient): Thenable<void> {
    return new Promise((resolve, reject) => {
      const stream = client.createWriteStream(uri.path);

      const onEnd = err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      };

      stream.on('error', onEnd);
      stream.on('finish', onEnd);
      stream.end();
    });
  }

  $writeFile(uri: vscode.Uri, content: Uint8Array, client: ConnectClient): Thenable<void> {
    return new Promise((resolve, reject) => {
      client.stat(uri.path, (statErr, stat) => {
        const mode = statErr ? 0o666 : stat.mode;
        const stream = client.createWriteStream(uri.path, { mode });
        const onEnd = err => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        };

        stream.on('error', onEnd);
        stream.on('finish', onEnd);
        stream.end(content);
      });
    });
  }

  async $delete(
    uri: vscode.Uri,
    options: { recursive: boolean },
    client: ConnectClient
  ): Promise<void> {
    const { recursive } = options;
    const stat = await this.$stat(uri, client);

    if (stat.type === vscode.FileType.Directory) {
      return this._deleteDir(uri, recursive, client);
    }

    return this._deleteFile(uri, client);
  }

  $rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
    client: ConnectClient
  ): Thenable<void> {
    return new Promise((resolve, reject) => {
      client.rename(oldUri.path, newUri.path, err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
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

  private _readLink(uri: vscode.Uri, client: ConnectClient): Thenable<Uint8Array> {
    return new Promise((resolve, reject) => {
      client.readlink(uri.path, (err, target) => {
        if (err) {
          reject(err);
          return;
        }

        const targetlUri = uri.with({ path: upath.join(uri.path, target) });
        this._readFile(targetlUri, client).then(resolve, reject);
      });
    });
  }

  private _readFile(uri: vscode.Uri, client: ConnectClient): Thenable<Uint8Array> {
    return new Promise((resolve, reject) => {
      const stream = client.createReadStream(uri.path);
      const arr = [];

      const onData = chunk => {
        arr.push(chunk);
      };

      const onEnd = err => {
        if (err) {
          reject(err);
          return;
        }

        resolve(Uint8Array.from(Buffer.concat(arr)));
      };

      stream.on('data', onData);
      stream.on('error', onEnd);
      stream.on('end', onEnd);
    });
  }

  private _deleteFile(uri: vscode.Uri, client: ConnectClient) {
    return new Promise<void>((resolve, reject) => {
      client.unlink(uri.path, err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  private _deleteDir(uri: vscode.Uri, recursive, client: ConnectClient) {
    return new Promise<void>((resolve, reject) => {
      if (!recursive) {
        client.rmdir(uri.path, err => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });

        return;
      }

      this.$readDirectory(uri, client).then(
        fileEntries => {
          // empty dir
          if (!fileEntries.length) {
            this._deleteDir(uri, false, client).then(resolve, e => {
              reject(e);
            });
            return;
          }

          const rmPromises = fileEntries.map(([filename, fileType]) => {
            const childUri = uri.with({ path: upath.join(uri.path, filename) });
            if (fileType === vscode.FileType.Directory) {
              return this._deleteDir(childUri, true, client);
            }
            return this._deleteFile(childUri, client);
          });

          Promise.all(rmPromises)
            .then(() => this._deleteDir(uri, false, client))
            .then(resolve, reject);
        },
        err => {
          reject(err);
        }
      );
    });
  }
}
