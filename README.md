# remote file system for  VS Code
Very simple, requires just three lines of config! Very fast, finished in a blink.


### Config

### Usage

### Commands
| Command              | Description                                  |Detailed description|
| -------------------- |----------------------------------------------|---------------|
| `SFTP: Config`         | create a new config file at workspace root  | see below for an explained config file |
| `SFTP: Upload`         | upload file/directory                       | copies selected files from the local to the remote directory, overwriting the remote ones. Files that are only present on the remote side won't be affected. Files that are only present on the local side will be created remotely|

### Example
You are even not required to config a password!
```json
{
  "host": "host",
  "username": "username",
  "remotePath": "/remote/workspace", 
}
```
You can also use an array of configs in the config file.
```json
[
  {
    "context": "/workspace/a",
    "host": "host",
    "username": "username",
    "password": "password",
    "remotePath": "/remote/workspace/a", 
  },
  {
    "context": "/workspace/b",
    "host": "host",
    "username": "username",
    "password": "password",
    "remotePath": "/remote/workspace/b", 
  }
]
```

You can see the full config [here](https://github.com/liximomo/vscode-sftp/wiki/config).

-----------------------------------------------------------------------------------------------------------

## Donation
If this project help you reduce time to develop, you can give me a cup of coffee :) 

### Alipay
![Alipay](https://raw.githubusercontent.com/liximomo/vscode-sftp/master/assets/alipay.png)

### Wechat
![Wechat](https://raw.githubusercontent.com/liximomo/vscode-sftp/master/assets/wechat.png)

### PayPal
[![PayPal](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/liximomo)
