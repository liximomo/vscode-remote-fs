import * as vscode from 'vscode';

export default function buildURI(scheme: string, name: string, path: string = '') {
  const removeLeadingSlash = path.replace(/^\/+/, '');
  return vscode.Uri.parse(`${scheme}://${name}/${removeLeadingSlash}`);
}
