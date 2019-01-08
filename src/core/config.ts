import { getUserSetting } from '../host';

const defaultConfig = {
  rootPath: '/',
  connectTimeout: 1000 * 10,
};

function withDefault(name, remote) {
  const copy = Object.assign({}, defaultConfig, remote);
  copy.name = name.toLowerCase();
  copy.scheme = copy.scheme.toLowerCase();

  // tslint:disable-next-line triple-equals
  if (copy.port == undefined) {
    switch (copy.scheme) {
      case 'sftp':
        copy.port = 22;
        break;
      case 'ftp':
        copy.port = 21;
        break;
      default:
        break;
    }
  }

  return copy;
}

export function getRemoteList() {
  const userConfig = getUserSetting();
  const remote = userConfig.remote;
  return Object.keys(remote).map(name => withDefault(name, remote[name]));
}

export function getExtensionSetting() {
  return getUserSetting();
}
