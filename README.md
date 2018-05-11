# remote file system for VS Code

Working with any file in everywhere like they are in local with vscdoe.

## Features

* Provide multiple schemes(sftp, ftp). More is coming!
* Password/Passphrase Prompting.
* Multiple remote folders at once.

## Usage

1.  Add your remote configs to "remotefs.remote" in your User Settings.
2.  `Ctrl+Shift+P` on Windows/Linux open command palette, run `Remote FS: Add Folder to Workspace` command.
3.  Enjoy it😘!

## Config
```json
{
  "dev": {
    "scheme": "sftp",
    "host": "host",
    "username": "username",
    "rootPath": "/path/to/somewhere"
  },
  "projectX": {
    "scheme": "sftp",
    "host": "host",
    "username": "username",
    "privateKeyPath": "/Users/xx/.ssh/id_rsa",
    "rootPath": "/home/foo/some/projectx"
  }
}
```

You can find extra options with auto complete(Ctrl+Space)!

You can also see the full config [here](https://github.com/liximomo/vscode-remote-fs/wiki/config).

---

## Donation

If this project help you reduce time to develop, you can give me a cup of coffee :)

### Alipay

![Alipay](https://raw.githubusercontent.com/liximomo/vscode-sftp/master/assets/alipay.png)

### Wechat

![Wechat](https://raw.githubusercontent.com/liximomo/vscode-sftp/master/assets/wechat.png)

### PayPal

[![PayPal](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/liximomo)
