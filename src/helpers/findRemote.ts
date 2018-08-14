import * as vscode from 'vscode';
import { getRemoteList } from '../core/config';

export function findRemoteByUri (uri: vscode.Uri ) {
  const remoteList = getRemoteList();
  return remoteList.find(remote => remote.name === uri.authority);
}

export function findRemoteByName(name: string ) {
  const remoteList = getRemoteList();
  return remoteList.find(remote => remote.name === name);
}
