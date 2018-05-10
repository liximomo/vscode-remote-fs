import RemoteFileSystemProvider from './RemoteFileSystemProvider';

const manager = {
  activeRemoteFSSet: new Set<RemoteFileSystemProvider>(),
};

export default {
  instance(fsClass: { new (...args: any[]): any }): RemoteFileSystemProvider {
    const fs = new fsClass();
    manager.activeRemoteFSSet.add(fs);
    return fs;
  },
  fses() {
    return manager.activeRemoteFSSet.values();
  },
};
