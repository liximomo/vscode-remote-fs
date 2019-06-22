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
        return reject(err);
      }

      resolve(data);
    });
  });
}

function getFileType(stat) {
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
  async connect(remote): Promise<ConnectClient> {
    let { password, passphrase } = remote;

    // tslint:disable triple-equals
    const shouldPromptForPass =
      password == undefined && remote.agent == undefined && remote.privateKeyPath == undefined;
    // tslint:enable

    if (remote.agent != undefined && remote.agent.startsWith('$')) {
        const evnVarName = remote.agent.slice(1);
        const val = process.env[evnVarName];
        if (!val) {
            throw new Error(`Environment variable "${evnVarName}" not found`);
        }
        remote.agent = val;
    }

    if (shouldPromptForPass) {
      // modify remote so we don't need later
      password = await promptForPassword('Enter your password');
    }

    // explict compare to true, cause we want to distinct between string and true
    if (passphrase === true) {
      // modify remote so we don't need later
      passphrase = await promptForPassword('Enter your passphrase');
    }

    const { interactiveAuth, connectTimeout, privateKeyPath, ...connectOption } = remote;

    connectOption.tryKeyboard = interactiveAuth;
    connectOption.readyTimeout = connectTimeout;
    connectOption.keepaliveInterval = 1000 * 30;

    if (privateKeyPath) {
      connectOption.privateKey = await readfile(privateKeyPath);
    }

    return this._connectClient({
      ...connectOption,
      password,
      passphrase,
    });
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
          return reject(err);
        }

        const filetype = getFileType(stat);

        if (filetype === vscode.FileType.SymbolicLink) {
          return this._realFileType(uri, client)
            .then(realType => ({
              type: vscode.FileType.SymbolicLink | realType, // tslint:disable-line: no-bitwise
              ctime: 0,
              mtime: stat.mtime * 1000,
              size: stat.size,
            }))
            .then(resolve, reject);
        }

        resolve({
          type: filetype,
          ctime: 0,
          mtime: stat.mtime * 1000,
          size: stat.size,
        });
      });
    });
  }

  $readDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<[string, vscode.FileType][]> {
    return new Promise((resolve, reject) => {
      client.readdir(uri.path, (err, stats) => {
        if (err) {
          return reject(err);
        }

        const promises: Thenable<[string, vscode.FileType]>[] = stats.map(stat => {
          const filename = stat.filename;
          const fileType = getFileType(stat.attrs);
          if (fileType === vscode.FileType.SymbolicLink) {
            return this._realFileType(
              uri.with({ path: upath.join(uri.path, filename) }),
              client
            ).then(realType => [
              filename,
              vscode.FileType.SymbolicLink | realType, // tslint:disable-line: no-bitwise
            ]);
          }

          return Promise.resolve([filename, fileType]);
        });

        Promise.all(promises).then(resolve, reject);
      });
    });
  }

  $createDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<void> {
    return new Promise<void>((resolve, reject) => {
      client.mkdir(uri.path, err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  $readFile(uri: vscode.Uri, client: ConnectClient): Thenable<Uint8Array> {
    return new Promise((resolve, reject) => {
      const stream = client.createReadStream(uri.path);
      const arr = [];

      const onData = chunk => {
        arr.push(chunk);
      };

      const onEnd = err => {
        if (err) {
          return reject(err);
        }

        resolve(Uint8Array.from(Buffer.concat(arr)));
      };

      stream.on('data', onData);
      stream.on('error', onEnd);
      stream.on('end', onEnd);
    });
  }

  // $createFile(uri: vscode.Uri, client: ConnectClient): Thenable<void> {
  //   return new Promise((resolve, reject) => {
  //     const stream = client.createWriteStream(uri.path);

  //     const onEnd = err => {
  //       if (err) {
  //         reject(err);
  //         return;
  //       }

  //       resolve();
  //     };

  //     stream.on('error', onEnd);
  //     stream.on('finish', onEnd);
  //     stream.end();
  //   });
  // }

  $writeFile(uri: vscode.Uri, content: Uint8Array, client: ConnectClient): Thenable<void> {
    return new Promise((resolve, reject) => {
      client.stat(uri.path, (statErr, stat) => {
        const mode = statErr ? 0o666 : stat.mode;
        const stream = client.createWriteStream(uri.path, { mode });
        const onEnd = err => {
          if (err) {
            return reject(err);
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

  $rename(oldUri: vscode.Uri, newUri: vscode.Uri, client: ConnectClient): Thenable<void> {
    return new Promise((resolve, reject) => {
      client.rename(oldUri.path, newUri.path, err => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  }

  private async _connectClient(option): Promise<ConnectClient> {
    return new Promise<ConnectClient>((resolve, reject) => {
      const client = new Client();
      client
        .on('ready', () => {
          client.sftp((err, sftp) => {
            if (err) {
              reject(err);
            }

            sftp.onEnd = cb => {
              return client
                .on('end', cb)
                .on('close', cb)
                .on('error', cb);
            };
            sftp.end = () => {
              return client.end();
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

  private async _realFileType(uri: vscode.Uri, client: ConnectClient): Promise<vscode.FileType> {
    let type;
    try {
      const realPath = await this._realPath(uri.path, client);
      const stat = await this.$stat(uri.with({ path: realPath }), client);
      type = stat.type;
    } catch (_) {
      // suppress error, fallback to Unknown for UX
      type = vscode.FileType.Unknown;
    }

    return type;
  }

  private _realPath(path: string, client: ConnectClient): Thenable<string> {
    return new Promise((resolve, reject) => {
      client.realpath(path, (err, target) => {
        if (err) {
          return reject(err);
        }

        resolve(upath.resolve(path, target));
      });
    });
  }

  private _deleteFile(uri: vscode.Uri, client: ConnectClient) {
    return new Promise<void>((resolve, reject) => {
      client.unlink(uri.path, err => {
        if (err) {
          return reject(err);
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
            return reject(err);
          }
          resolve();
        });

        return;
      }

      this.$readDirectory(uri, client).then(
        fileEntries => {
          // empty dir
          // if (!fileEntries.length) {
          //   this._deleteDir(uri, false, client).then(resolve, e => {
          //     reject(e);
          //   });
          //   return;
          // }

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
