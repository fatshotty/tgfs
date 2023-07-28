import { Readable, Writable } from 'stream';

import * as fs from 'fs';
import 'webdav-server/lib/index.v2';
import {
  CreateInfo,
  CreationDateInfo,
  DeleteInfo,
  Errors,
  FileSystem,
  FileSystemSerializer,
  ILockManager,
  IPropertyManager,
  LastModifiedDateInfo,
  LocalLockManager,
  LockManagerInfo,
  OpenReadStreamInfo,
  OpenWriteStreamInfo,
  Path,
  PropertyManagerInfo,
  ReadDirInfo,
  ResourceType,
  ReturnCallback,
  SimpleCallback,
  SizeInfo,
  TypeInfo,
} from 'webdav-server/lib/index.v2';

import { Client } from '../../api';
import {
  createDir,
  createEmptyFile,
  list,
  removeDir,
  removeFile,
} from '../../api/ops';
import { loginAsBot } from '../../auth';
import { TGFSDirectory, TGFSFileRef } from '../../model/directory';
import { TGFSPropertyManager } from './tgfs-propertymanager';

export class TGFSFileSystemResource {
  props: TGFSPropertyManager;
  locks: LocalLockManager;

  constructor(data?: TGFSFileSystemResource) {
    if (!data) {
      this.props = new TGFSPropertyManager();
      this.locks = new LocalLockManager();
    } else {
      const rs = data as TGFSFileSystemResource;
      this.props = new TGFSPropertyManager(rs.props);
      this.locks = new LocalLockManager();
    }
  }
}

export class TGFSSerializer implements FileSystemSerializer {
  uid(): string {
    return 'TGFSSerializer-1.0.0';
  }

  serialize(fileSystem: TGFSFileSystem, callback: ReturnCallback<any>): void {
    callback(null, {});
  }

  unserialize(serializedData: any, callback: ReturnCallback<FileSystem>): void {
    (async () => {
      const client = await loginAsBot();
      await client.init();
      const fileSystem = new TGFSFileSystem(serializedData.rootPath);
      callback(null, fileSystem);
    })();
  }
}

const call =
  (callback: SimpleCallback) =>
  (
    promise: Promise<any>,
    then: (...args: any) => any = () => callback(null),
  ) => {
    promise.then(then).catch((e) => {
      callback(e);
    });
  };

export class TGFSFileSystem extends FileSystem {
  constructor(public readonly tgClient: Client) {
    super(new TGFSSerializer());
  }

  protected _create(
    path: Path,
    ctx: CreateInfo,
    _callback: SimpleCallback,
  ): void {
    if (ctx.type.isDirectory) {
      call(_callback)(createDir(this.tgClient)(path.toString(), false));
    } else if (ctx.type.isFile) {
      _callback(Errors.InvalidOperation);
    } else {
      _callback(Errors.InvalidOperation);
    }
  }

  protected _delete(
    path: Path,
    ctx: DeleteInfo,
    _callback: SimpleCallback,
  ): void {
    this.type(ctx.context, path, (e, type) => {
      if (e) return _callback(Errors.ResourceNotFound);
      if (type.isDirectory) {
        call(_callback)(removeDir(this.tgClient)(path.toString(), true));
      } else {
        call(_callback)(removeFile(this.tgClient)(path.toString()));
      }
    });
  }

  protected _size(
    path: Path,
    ctx: SizeInfo,
    callback: ReturnCallback<number>,
  ): void {
    list(this.tgClient)(path.toString())
      .then((res) => {
        if (!Array.isArray(res)) {
          this.tgClient
            .getFileInfo(res)
            .then((file) => {
              callback(null, file.getLatest().size);
            })
            .catch((e) => {
              callback(e);
            });
        } else {
          callback(null, 0);
        }
      })
      .catch((e) => {
        callback(e);
      });
  }

  protected _readDir(
    path: Path,
    ctx: ReadDirInfo,
    callback: ReturnCallback<string[] | Path[]>,
  ): void {
    list(this.tgClient)(path.toString())
      .then((res) => {
        callback(
          null,
          (res as Array<TGFSFileRef | TGFSDirectory>).map((item) => item.name),
        );
      })
      .catch((e) => {
        callback(e);
      });
  }

  protected getStatDateProperty(
    path: Path,
    ctx: any,
    propertyName: string,
    callback: ReturnCallback<number>,
  ): void {
    list(this.tgClient)(path.toString())
      .then((res) => {
        if (!Array.isArray(res)) {
          this.tgClient.getFileInfo(res).then((file) => {
            if (propertyName === 'mtime') {
              callback(null, file.getLatest().updatedAt.getTime());
            } else {
              callback(null, file.createdAt.getTime());
            }
          });
        } else {
          callback(null, 0);
        }
      })
      .catch((e) => {
        callback(e);
      });
  }

  protected _creationDate(
    path: Path,
    ctx: CreationDateInfo,
    callback: ReturnCallback<number>,
  ): void {
    this.getStatDateProperty(path, ctx, 'birthtime', callback);
  }

  protected _lastModifiedDate(
    path: Path,
    ctx: LastModifiedDateInfo,
    callback: ReturnCallback<number>,
  ): void {
    this.getStatDateProperty(path, ctx, 'mtime', callback);
  }

  protected _lockManager(
    path: Path,
    ctx: LockManagerInfo,
    callback: ReturnCallback<ILockManager>,
  ): void {
    callback(null, new LocalLockManager());
  }

  protected _propertyManager(
    path: Path,
    ctx: PropertyManagerInfo,
    callback: ReturnCallback<IPropertyManager>,
  ): void {
    callback(null, new TGFSPropertyManager());
  }

  protected _type(
    path: Path,
    ctx: TypeInfo,
    callback: ReturnCallback<ResourceType>,
  ): void {
    list(this.tgClient)(path.toString())
      .then((res) => {
        if (Array.isArray(res)) {
          callback(null, ResourceType.Directory);
        } else {
          callback(null, ResourceType.File);
        }
      })
      .catch(() => {
        callback(Errors.ResourceNotFound);
      });
  }

  protected _openWriteStream(
    path: Path,
    ctx: OpenWriteStreamInfo,
    callback: ReturnCallback<Writable>,
  ): void {
    console.log('write', path);
    fs.open(path.toString(), 'w+', (e, fd) => {
      console.log(e);
      if (e) return callback(Errors.ResourceNotFound);
      callback(null, fs.createWriteStream(null, { fd }));
    });
  }

  protected _openReadStream(
    path: Path,
    ctx: OpenReadStreamInfo,
    callback: ReturnCallback<Readable>,
  ): void {
    list(this.tgClient)(path.toString()).then((fileRef) => {
      if (fileRef instanceof TGFSFileRef) {
        this.tgClient
          .downloadFileAtVersion(fileRef)
          .then((buffer) => {
            callback(null, Readable.from(buffer));
          })
          .catch((e) => {
            console.log(e);
            callback(e);
          });
      } else {
        callback(Errors.InvalidOperation);
      }
    });
  }
}