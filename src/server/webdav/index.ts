import { v2 as webdav } from 'webdav-server';

import { Client } from 'src/api';
import { config } from 'src/config';
import { Logger } from 'src/utils/logger';

import { TGFSFileSystem } from './tgfs-filesystem';

export const webdavServer = (
  client: Client,
  options?: webdav.WebDAVServerOptions,
) => {
  const server = new webdav.WebDAVServer(options);

  server.httpAuthentication = new webdav.HTTPBasicAuthentication({
    getUserByNamePassword: (username, password, cb) => {
      const user = config.webdav.users[username];
      if (user && user.password === password) {
        cb(null, { uid: username, username });
      } else {
        cb(webdav.Errors.UserNotFound);
      }
    },
    getDefaultUser(cb) {
      cb(null);
    },
  });

  server.beforeRequest((ctx, next) => {
    Logger.info(ctx.request.method, ctx.requested.uri);
    next();
  });
  server.afterRequest((ctx, next) => {
    Logger.info(ctx.request.method, ctx.response.statusCode);
    next();
  });
  server.setFileSystemSync('/', new TGFSFileSystem(client));

  return server;

  // server.start((httpServer) => {
  //   const address = httpServer.address() as any;
  //   let host = address.address;
  //   if (host === '0.0.0.0' || host === '::') {
  //     host = ip.address();
  //   }
  //   Logger.info(`WebDAV server is running on ${host}:${address.port}/${path}`);
  // });
};
