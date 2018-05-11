import * as vscode from 'vscode';
import { EXTENSION_NAME } from './constants';

export interface Logger {
  trace(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string | Error, ...args: any[]): void;
  critical(message: string | Error, ...args: any[]): void;
}

class VSCodeLogger implements Logger {
  private _outputChannel: vscode.OutputChannel;

  trace(message: string, ...args: any[]) {
    this._print('[trace]', message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this._print('[debug]', message, ...args);
  }

  info(message: string, ...args: any[]) {
    this._print('[info]', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this._print('[warn]', message, ...args);
  }

  error(message: string | Error, ...args: any[]) {
    this._print('[error]', message, ...args);
  }

  critical(message: string | Error, ...args: any[]) {
    this._print('[critical]', message, ...args);
  }

  private _print(...args: any[]) {
    if (!this._outputChannel) {
      this._outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
    }

    const msg = args
      .map(arg => {
        if (arg instanceof Error) {
          return arg.stack;
        } else if (typeof arg === 'object') {
          return JSON.stringify(arg);
        }
        return arg;
      })
      .join(' ');

    this._outputChannel.appendLine(msg);
  }
}

const logger = new VSCodeLogger();

export default logger;
