import * as vscode from 'vscode';
import * as upath from 'upath';
import logger from '../logger';
import toAbsoluteUri from '../helpers/toAbsoluteUri';
import reportError from '../helpers/reportError';
import ConnectManager, { Connect, ConnectClient } from './ConnectManager';

export enum ErrorCode {
  FILE_NOT_FOUND = 2,
  PERMISSION_DENIED = 3,
  FILE_EXISTS = 4,
}

function createNotFoundError(uri: vscode.Uri) {
  return vscode.FileSystemError.FileNotFound(`${uri.path} not found`);
}

function createNoPermissionsError(uri: vscode.Uri) {
  return vscode.FileSystemError.NoPermissions(`${uri.path} no permissions`);
}

function createFileExistsError(uri: vscode.Uri) {
  return vscode.FileSystemError.FileExists(`${uri.path} already exists`);
}

export default abstract class RemoteFileSystemProvider implements vscode.FileSystemProvider {
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

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

  abstract isFileExist(uri: vscode.Uri, client: ConnectClient): Thenable<boolean>;

  abstract $stat(uri: vscode.Uri, client: ConnectClient): Thenable<vscode.FileStat>;
  abstract $readDirectory(
    uri: vscode.Uri,
    client: ConnectClient
  ): Thenable<[string, vscode.FileType][]>;
  abstract $createDirectory(uri: vscode.Uri, client: ConnectClient): Thenable<void>;
  abstract $readFile(uri: vscode.Uri, client: ConnectClient): Thenable<Uint8Array>;
  abstract $createFile(uri: vscode.Uri, client: ConnectClient): Thenable<void>;
  abstract $writeFile(uri: vscode.Uri, content: Uint8Array, client: ConnectClient): Thenable<void>;
  abstract $delete(
    uri: vscode.Uri,
    options: { recursive: boolean },
    client: ConnectClient
  ): Thenable<void>;
  abstract $rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
    client: ConnectClient
  ): Thenable<void>;
  // abstract $copy?(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }): Thenable<void>;

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    logger.trace('stat', uri.path);
    const connect = await this._connect(uri);
    try {
      return await this.$stat(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        error = createNotFoundError(uri);
      }

      reportError(error);
      throw error;
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    logger.trace('readDirectory', uri.path);
    const connect = await this._connect(uri);
    try {
      return await this.$readDirectory(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        error = createNotFoundError(uri);
      }

      reportError(error);
      throw error;
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    logger.trace('createDirectory', uri.path);
    const connect = await this._connect(uri);
    try {
      await this.$createDirectory(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        error = createNotFoundError(uri);
      }

      if (error.code === ErrorCode.PERMISSION_DENIED) {
        error = createNoPermissionsError(uri);
      }

      if (error.code === ErrorCode.FILE_EXISTS) {
        error = createFileExistsError(uri);
      }

      reportError(error);
      throw error;
    }
    const dirname = uri.with({ path: upath.dirname(uri.path) });
    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      { type: vscode.FileChangeType.Created, uri }
    );
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    logger.trace('readFile', uri.path);
    const connect = await this._connect(uri);
    try {
      return await this.$readFile(toAbsoluteUri(uri, connect.wd), connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        error = createNotFoundError(uri);
      }

      reportError(error);
      throw error;
    }
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    logger.trace('writeFile', uri.path);
    const connect = await this._connect(uri);
    const absolute = toAbsoluteUri(uri, connect.wd);
    const isExist = await this.isFileExist(absolute, connect.client);

    if (!isExist && !options.create) {
      const error = createNotFoundError(uri);
      reportError(error);
      throw error;
    }

    if (isExist && options.create && !options.overwrite) {
      const error = createFileExistsError(uri);
      reportError(error);
      throw error;
    }

    try {
      await this.$writeFile(absolute, content, connect.client);
    } catch (error) {
      if (error.code === ErrorCode.PERMISSION_DENIED) {
        error = createNoPermissionsError(uri);
      }

      reportError(error);
      throw error;
    }

    if (!isExist) {
      this._fireSoon({ type: vscode.FileChangeType.Created, uri });
    }

    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    logger.trace('delete', uri.path);
    const connect = await this._connect(uri);
    try {
      await this.$delete(toAbsoluteUri(uri, connect.wd), options, connect.client);
    } catch (error) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        error = createNotFoundError(uri);
      }

      if (error.code === ErrorCode.PERMISSION_DENIED) {
        error = createNoPermissionsError(uri);
      }

      reportError(error);
      throw error;
    }
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
    logger.trace('rename', oldUri.path, newUri.path);
    const connect = await this._connect(oldUri);
    const { overwrite } = options;

    if (!overwrite) {
      const isExist = await this.isFileExist(newUri, connect.client);
      if (isExist) {
        const error = createFileExistsError(newUri);
        reportError(error);
        throw error;
      }
    }

    try {
      await this.$rename(
        toAbsoluteUri(oldUri, connect.wd),
        toAbsoluteUri(newUri, connect.wd),
        options,
        connect.client
      );
    } catch (error) {
      reportError(error);
      throw error;
    }

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
    try {
      return await this._connectManager.connecting(uri, this.connect);
    } catch (error) {
      reportError(error);
    }
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
