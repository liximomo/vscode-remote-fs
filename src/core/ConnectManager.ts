import * as vscode from 'vscode';
import { getRemoteList } from './config';
import findRemote from '../helpers/findRemote';
import getRemoteIdentityFromUri from '../helpers/getRemoteIdentityFromUri';

enum ConnectStatus {
  PENDING = 1,
  DONE = 2,
  END = 3,
}

export interface ConnectClient {
  [key: string]: any;
  onEnd: (cb: () => void) => void;
  end: () => void;
}

export interface Connect {
  id: string;
  name: string;
  wd: string;
  client: ConnectClient;
}

export default class ConnectManager {
  private _connMap = new Map<string, Connect | Promise<Connect>>();
  private _connStatusMap = new Map<string, ConnectStatus>();

  async connecting(uri: vscode.Uri, connect: (any) => Promise<ConnectClient>): Promise<Connect> {
    const id = getRemoteIdentityFromUri(uri);
    const status = this._connStatusMap.get(id);

    if (status === ConnectStatus.DONE || status === ConnectStatus.PENDING) {
      const client = this._connMap.get(id);
      if (!client) {
        throw new Error('unkonw error!');
      }
      return client;
    }

    const remote = findRemote(uri, getRemoteList());
    if (!remote) {
      // todo error report
      // tslint:disable-next-line quotemark
      throw new Error("can't find remote");
    }

    this._connStatusMap.set(id, ConnectStatus.PENDING);

    const connPromise = connect(remote)
      .then(client => {
        console.log('connect success');
        const connectInstance = {
          id: remote.name,
          name: remote.name,
          wd: remote.rootPath,
          client,
        };
        this._connStatusMap.set(id, ConnectStatus.DONE);
        this._connMap.set(id, connectInstance);

        client.onEnd(() => this._handleConnectEnd(connectInstance));
        return connectInstance;
      })
      .catch(error => {
        // todo error report
        this._connStatusMap.set(id, ConnectStatus.END);
        throw error;
      });
    this._connMap.set(id, connPromise);

    return connPromise;
  }

  destroy() {
    for (const connect of this._connMap.values()) {
      if ((connect as Connect).client) {
        (connect as Connect).client.end();
      }
    }
  }

  private _handleConnectEnd(client: Connect) {
    this._connStatusMap.set(client.id, ConnectStatus.END);
    this._connMap.delete(client.id);
  }
}
