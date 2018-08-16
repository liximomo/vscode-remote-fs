import * as vscode from 'vscode';
import * as upath from 'upath';
import * as Ftp from 'jsftp';
import * as PQueue from 'p-queue';
import { promptForPassword } from '../host';
import RemoteFileSystemProvider, { FileSystemError } from '../core/RemoteFileSystemProvider';
import { ConnectClient } from '../core/ConnectManager';

enum FtpFileType {
  FILE_TYPE = 0,
  DIRECTORY_TYPE = 1,
  SYMBOLIC_LINK_TYPE = 2,
  UNKNOWN_TYPE = 3,
}

interface FfpFileEntry {
  name: string;
  size: number;
  time: number;
  type: number;
}

function getFileType(type) {
  switch (type) {
    case 1:
      return vscode.FileType.Directory;
    case 0:
      return vscode.FileType.File;
    case 2:
      return vscode.FileType.SymbolicLink;
    default:
      return vscode.FileType.Unknown;
  }
}

export default class FTPFSProvider extends RemoteFileSystemProvider {
  private _queue: any = new PQueue({ concurrency: 1 });

  async connect(remote): Promise<ConnectClient> {
    let password = remote.password;

    // tslint:disable triple-equals
    const shouldPromptForPass = password == undefined;
    // tslint:enable

    if (shouldPromptForPass) {
      // modify remote so we don't need later
      password = await promptForPassword('Enter your password');
    }

    const { connectTimeout, host, port, username } = remote;

    return this._connectClient({
      host,
      port,
      user: username,
      pass: password,
      timeout: connectTimeout,
    });
  }

  async isFileExist(uri: vscode.Uri, client: ConnectClient): Promise<boolean> {
    try {
      await this._stat(uri, client);
      return true;
    } catch {
      return false;
    }
  }

  async $stat(uri: vscode.Uri, client: ConnectClient): Promise<vscode.FileStat> {
    const stat = await this._stat(uri, client);

    return {
      type: getFileType(stat.type),
      ctime: 0,
      mtime: stat.time,
      size: stat.size,
    };
  }

  async $readDirectory(
    uri: vscode.Uri,
    client: ConnectClient
  ): Promise<[string, vscode.FileType][]> {
    const entries = await this._readdir(uri.path, client);
    return entries.map(entry => [entry.name, getFileType(entry.type)] as [string, vscode.FileType]);
  }

  $createDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<void> {
    return this._createDirAtomic(uri.path, client);
  }

  $readFile(uri: vscode.Uri, client: ConnectClient): Thenable<Uint8Array> {
    return this._readFileAtomic(uri.path, client);
  }

  $writeFile(uri: vscode.Uri, content: Uint8Array, client: ConnectClient): Thenable<void> {
    return this._wrireFileAtomic(uri.path, content, client);
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

  async $rename(oldUri: vscode.Uri, newUri: vscode.Uri, client: ConnectClient): Promise<void> {
    await this._RNFRAtomic(oldUri.path, client);
    await this._RNTOAtomic(newUri.path, client);
  }

  private async _connectClient(option): Promise<ConnectClient> {
    return new Promise<ConnectClient>((resolve, reject) => {
      const client = new Ftp({
        host: option.host,
        port: option.port,
      });

      client.socket.setTimeout(option.timeout);

      // caution: privete property
      // set pasv timeout
      client.timeout = option.timeout;
      client.keepAlive(1000 * 10);
      client.onEnd = cb => {
        client.socket.once('end', cb);
        client.socket.once('close', cb);
        client.socket.once('error', cb);
      };
      client.end = () => {
        client.destroy();
      };

      client.auth(option.user, option.pass, err => {
        if (err) {
          return reject(err);
        }

        return resolve(client);
      });
    });
  }

  private async _stat(uri: vscode.Uri, client: ConnectClient): Promise<FfpFileEntry> {
    if (uri.path === '/') {
      return {
        name: '/',
        type: FtpFileType.DIRECTORY_TYPE,
        time: 0,
        size: 0,
      };
    }

    const name = upath.basename(uri.path);
    const dir = upath.dirname(uri.path);
    const entries = await this._readdir(dir, client);
    const target = entries.find(entry => entry.name === name);

    if (!target) {
      throw FileSystemError.FileNotFound(uri);
    }

    return target;
  }

  private _readdir(dir: string, client: ConnectClient): Promise<FfpFileEntry[]> {
    return this._readdirAtomic(dir, client);
  }

  private _deleteFile(uri: vscode.Uri, client: ConnectClient) {
    return this._deleteFileAtomic(uri.path, client);
  }

  private _deleteDir(uri: vscode.Uri, recursive, client: ConnectClient): Promise<void> {
    if (!recursive) {
      return this._deleteDirAtomic(uri.path, client);
    }

    return new Promise<void>((resolve, reject) => {
      this.$readDirectory(uri, client).then(
        fileEntries => {
          const rmPromises = fileEntries.map(([filename, fileType]) => {
            const childUri = uri.with({ path: upath.join(uri.path, filename) });
            if (fileType === vscode.FileType.Directory) {
              return this._deleteDir(childUri, true, client);
            }
            return this._deleteFile(childUri, client);
          });

          Promise.all(rmPromises)
            .then(() => this._deleteDirAtomic(uri.path, client))
            .then(resolve, reject);
        },
        err => {
          reject(err);
        }
      );
    });
  }

  private _readdirAtomic(dir: string, client: ConnectClient): Promise<FfpFileEntry[]> {
    const task = () =>
      new Promise((resolve, reject) => {
        client.ls(dir, (err, entries) => {
          if (err) {
            return reject(err);
          }

          resolve(entries);
        });
      });

    return this._queue.add(task);
  }

  private _deleteFileAtomic(path: string, client: ConnectClient): Promise<void> {
    const task = () =>
      new Promise<void>((resolve, reject) => {
        client.raw('DELE', path, err => {
          if (err) {
            return reject(err);
          }

          resolve();
        });
      });

    return this._queue.add(task);
  }

  private _deleteDirAtomic(path: string, client: ConnectClient): Promise<void> {
    const task = () =>
      new Promise<void>((resolve, reject) => {
        client.raw('RMD', path, err => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

    return this._queue.add(task);
  }

  private _readFileAtomic(path: string, client: ConnectClient): Promise<Uint8Array> {
    const task = () =>
      new Promise<Uint8Array>((resolve, reject) => {
        client.get(path, (err, socket) => {
          if (err) {
            return reject(err);
          }

          const arr = [];
          const onData = chunk => {
            arr.push(chunk);
          };

          const onEnd = _err => {
            if (_err) {
              reject(_err);
              return;
            }

            resolve(Uint8Array.from(Buffer.concat(arr)));
          };

          socket.on('data', onData);
          socket.on('close', onEnd);

          socket.resume();
        });
      });

    return this._queue.add(task);
  }

  private _wrireFileAtomic(
    path: string,
    content: Uint8Array,
    client: ConnectClient
  ): Promise<void> {
    const task = () =>
      new Promise<void>((resolve, reject) => {
        client.put(content, path, err => {
          if (err) {
            return reject(err);
          }

          resolve();
        });
      });

    return this._queue.add(task);
  }

  private _createDirAtomic(path: string, client: ConnectClient): Promise<void> {
    const task = () =>
      new Promise<void>((resolve, reject) => {
        client.raw('MKD', path, err => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

    return this._queue.add(task);
  }

  private _RNFRAtomic(path: string, client: ConnectClient): Promise<void> {
    const task = () =>
      new Promise<void>((resolve, reject) => {
        client.raw('RNFR', path, err => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

    return this._queue.add(task);
  }

  private _RNTOAtomic(path: string, client: ConnectClient): Promise<void> {
    const task = () =>
      new Promise<void>((resolve, reject) => {
        client.raw('RNTO', path, err => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

    return this._queue.add(task);
  }
}
