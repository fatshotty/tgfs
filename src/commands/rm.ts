import { Client } from '../api';
import { navigateToDir } from './navigate-to-dir';
import { splitPath } from './utils';

export const rm =
  (client: Client) => async (path: string, recursive: boolean) => {
    const [basePath, name] = splitPath(path);
    const dir = await navigateToDir(client)(basePath);
    if (!recursive) {
      const fileRef = dir.findFiles([name])[0];
      await client.deleteFileAtVersion(fileRef);
    } else {
      const nextDir = name ? dir.findChildren([name])[0] : dir;
      await client.deleteDirectory(nextDir);
    }
    return `removed ${path}`;
  };