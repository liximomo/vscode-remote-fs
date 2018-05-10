import * as vscode from 'vscode';

export default function findRemote(uri: vscode.Uri, remoteList: any[]) {
  return remoteList.find(remote => remote.name === uri.authority);
}
