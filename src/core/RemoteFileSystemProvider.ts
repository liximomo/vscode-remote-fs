import * as vscode from 'vscode';
import * as upath from 'upath';
import File from './File';
import Directory from './Directory';
import toAbsoluteUri from '../helpers/toAbsoluteUri';
import { getRemoteList } from './config';
import ConnectManager, { Connect, ConnectClient } from './ConnectManager';

enum ErrorCode {
  FILE_NOT_FOUND = 2,
  PERMISSION_DENIED = 3,
  FILE_EXISTS = 4,
}

export default abstract class RemoteFileSystemProvider implements vscode.FileSystemProvider {
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  private _rootPath: string;
  private _connectManager: ConnectManager;

  private _emitter: vscode.EventEmitter<vscode.FileChangeEvent[]>;
  private _bufferedEvents: vscode.FileChangeEvent[];
  private _fireSoonHandle: NodeJS.Timer;

  constructor() {
    this._connectManager = new ConnectManager();
    this._emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    this._bufferedEvents = [];
    this.onDidChangeFile = this._emitter.event;

    this.connect = this.connect.bind(this);
  }

  abstract isFileExist(uri: vscode.Uri): Thenable<boolean>;

  abstract $stat(uri: vscode.Uri, client: ConnectClient): Thenable<vscode.FileStat>;
  abstract $readDirectory(
    uri: vscode.Uri,
    client: ConnectClient
  ): Thenable<[string, vscode.FileType][]>;
  abstract $createDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<void>;
  abstract $readFile(uri: vscode.Uri): Thenable<Uint8Array>;
  abstract $createFile(uri: vscode.Uri): Thenable<void>;
  abstract $writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
  abstract $delete(uri: vscode.Uri, options: { recursive: boolean }): Thenable<void>;
  abstract $rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): Thenable<void>;
  // abstract $copy?(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }): Thenable<void>;

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const connect = await this._connect(uri);
    try {
      return await this.$stat(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }

      throw error;
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const connect = await this._connect(uri);
    try {
      return await this.$readDirectory(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }

      throw error;
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const connect = await this._connect(uri);
    try {
      await this.$createDirectory(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }

      if (error.code === ErrorCode.PERMISSION_DENIED) {
        throw vscode.FileSystemError.NoPermissions(uri);
      }

      if (error.code === ErrorCode.FILE_EXISTS) {
        throw vscode.FileSystemError.FileExists(uri);
      }

      throw error;
    }
    const dirname = uri.with({ path: upath.dirname(uri.path) });
    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      { type: vscode.FileChangeType.Created, uri }
    );
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    await this._connect(uri);
    return this.$readFile(toAbsoluteUri(uri, this._rootPath));
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const absolute = toAbsoluteUri(uri, this._rootPath);
    await this._connect(uri);
    const isExist = await this.isFileExist(absolute);

    if (!isExist && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (isExist && options.create && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }
    if (!isExist) {
      await this.$createFile(absolute);
      this._fireSoon({ type: vscode.FileChangeType.Created, uri });
    }

    await this.$writeFile(absolute, content);
    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    await this._connect(uri);
    await this.$delete(toAbsoluteUri(uri, this._rootPath), options);
    const dirname = uri.with({ path: upath.dirname(uri.path) });
    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      { uri, type: vscode.FileChangeType.Deleted }
    );
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): Promise<void> {
    await this._connect(oldUri);
    await this.$rename(
      toAbsoluteUri(oldUri, this._rootPath),
      toAbsoluteUri(newUri, this._rootPath),
      options
    );
    this._fireSoon(
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri }
    );
  }

  watch(resource: vscode.Uri, opts): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => undefined);
  }

  destroy() {
    this._connectManager.destroy();
  }

  protected abstract connect(remoteConfig: object): Promise<ConnectClient>;

  private async _connect(uri: vscode.Uri): Promise<Connect> {
    return this._connectManager.connecting(uri, this.connect);
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._bufferedEvents.push(...events);
    clearTimeout(this._fireSoonHandle);
    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents);
      this._bufferedEvents.length = 0;
    }, 5);
  }
}
