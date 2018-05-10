import * as vscode from 'vscode';
import * as upath from 'upath';

export default function toAbsoluteUri(uri: vscode.Uri, base) {
  if (!base || uri.query.indexOf('absolute') !== -1) {
    return uri;
  }

  return uri.with({
    path: upath.join(base, uri.path.replace(/^\/+/, '')),
  });
}
