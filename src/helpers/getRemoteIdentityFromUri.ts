import * as vscode from 'vscode';

export default function getRemoteIdentityFromUri(uri: vscode.Uri) {
  return uri.authority;
}
