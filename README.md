# Remote File System for VS Code

Working with any file in everywhere like they are in local with vscdoe.

## Features

* Open remote from `code` CLI.
* Provide multiple schemes(sftp, ftp). More is coming!
* Password/Passphrase Prompting.
* Multiple remote folders at once.

## Setup

1.  Open User Settings.

    * On Windows/Linux - File > Preferences > Settings
    * On macOS - Code > Preferences > Settings

2.  Add your remote configs to "remotefs.remote" in your User Settings.
3.  `Cmd+Shift+P` open command palette(`Ctrl+Shift+P` on Windows/Linux), run `Remote FS: Add Folder to Workspace` command.
4.  Enjoy it😘!

## Config

```json
{
  "remotefs.remote": {
    "dev": {
      "scheme": "sftp",
      "host": "host",
      "username": "username",
      "rootPath": "/path/to/somewhere"
    },
    "site": {
      "scheme": "ftp",
      "host": "host",
      "username": "username"
    },
    "projectX": {
      "scheme": "sftp",
      "host": "host",
      "username": "username",
      "privateKeyPath": "/Users/xx/.ssh/id_rsa",
      "rootPath": "/home/foo/some/projectx"
    }
  }
}
```

You can find extra options with auto complete(Ctrl+Space)!

You can also see the full config [here](https://github.com/liximomo/vscode-remote-fs/wiki/config).

## CLI
Once you've config your remote in User Setting. You can open any remote from `code` CLI in your terminal.

### Usage

```
code --folder-uri <scheme>://<remote>[/path]
```

### Example

Setting: 

```
{
  "remotefs.remote": {
    "test": {
      "scheme": "ftp",
      "host": "host",
      "username": "username"
    },
    "projectX": {
      "scheme": "sftp",
      "host": "host",
      "username": "username",
      "privateKeyPath": "/Users/xx/.ssh/id_rsa",
      "rootPath": "/home/foo/some/projectx"
    }
  }
}
```

Open projectX at `rootPath`（/home/foo/some/projectx）.

```
code --folder-uri sftp://projectX/
```

Open projectX at `rootPath/dirA` (/home/foo/some/projectx/dirA).

```
code --folder-uri sftp://projectX/dirA
```

Open test at `rootPath`.

```
code --folder-uri ftp://test/
```
---

## Donation

If this project help you reduce time to develop, you can give me a cup of coffee :)

### Alipay

![Alipay](https://raw.githubusercontent.com/liximomo/vscode-sftp/master/assets/alipay.png)

### Wechat

![Wechat](https://raw.githubusercontent.com/liximomo/vscode-sftp/master/assets/wechat.png)

### PayPal

[![PayPal](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/liximomo)
