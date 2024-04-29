import {join, resolve, dirname} from 'node:path';
import { config } from 'src/config';
import { Logger } from 'src/utils/logger';
import Realm, { ObjectSchema, Configuration, Results, BSON } from 'realm';


class Entry extends Realm.Object {
  static NAME = 'Entry';

  _id?: string;
  parent?: string
  name!: string
  originalName?: string
  size: number;
  ctime!: number;
  mtime!: number
  mmtime!: number
  mime!: string
  parts?: Realm.List<Part>;

  static schema : ObjectSchema = {
    name: 'Entry',
    properties: {
      _id: { type: "string", default: () => new Realm.BSON.ObjectId().toString(), indexed: true },
      parent: 'string?',
      name: 'string',
      originalName: 'string?',
      size: 'double?',
      ctime: 'double',
      mtime: 'double',
      mmtime: 'double',
      mime: 'string',
      parts: 'Part[]'
    },
    primaryKey: '_id'
  };

  get ID() {
    return this._id;
  }
}

class Part extends Realm.Object<Entry> {
  static NAME = 'Part';

  _id!: string;
  messageId!: number;
  fileId!: number;
  chatId!: number;
  fileName!: string;
  originalFilename!: string;
  size!: number;
  ctime!: number;
  mtime!: number;

  static schema : ObjectSchema = {
    name: 'Part',
    embedded: true,
    properties: {
      _id: { type: "string", default: () => new Realm.BSON.ObjectId().toString(), indexed: true },
      messageId: {type: 'int', indexed: true},
      fileId: {type: 'int', indexed: true},
      chatId: {type: 'int', indexed: true},
      fileName: 'string',
      originalFilename: 'string',
      size: 'double',
      ctime: 'double',
      mtime: 'double',
    }
  }
}

let DB : Realm = null

export async function startDB() : Promise<void> {

  const DB_PATH : string = join( resolve(config.db.path), 'tgfs.realm');

  Logger.info('Starting up db in', DB_PATH);

  const realConfig : Configuration = {
    path: DB_PATH,
    schema: [Part.schema, Entry.schema],
    schemaVersion: 1
  };

  DB = await Realm.open(realConfig);
}


export function checkEntryId(id: string) : boolean {
  return !!DB.objectForPrimaryKey(Entry.NAME, id);
}

export function createFolder(parent: string | null, name : string) : Realm.Object<Entry> {

  let parentFolderId : string | null = null; // default: root folder
  if ( parent && checkEntryId(parent) ) {
    parentFolderId = parent;
  }

  const alreadyExistingFolders = findByName(parentFolderId, name);

  if ( alreadyExistingFolders.length > 0 ) {
    throw `Folder '${name}' already exists in '${parent || 'root'}'`;
  }

  const entry = {
    parent: parentFolderId,
    name: name,
    originalName: name,
    size: 0,
    ctime: Date.now(),
    mtime: Date.now(),
    mmtime: Date.now(),
    mime: 'folder',
  };

  // @ts-ignore
  return DB.write(() => {
    return DB.create(Entry.NAME, entry, Realm.UpdateMode.Modified);
  });
}

export function listSubfolder(parent : string | null) : Results<Entry> {

  let parentFolderId : string | null = null; // default: root folder
  if ( parent && checkEntryId(parent) ) {
    parentFolderId = parent;
  }

  const objs = DB.objects<Entry>( Entry.NAME );
  // @ts-ignore
  return objs.filtered('parent == $0', parentFolderId);
}


export function findByName(parent: string | null, name: string, all = false) : Results<any> {

  let entries = DB.objects<Entry>( Entry.NAME );

  if ( !all ) {
    let parentFolderId : string | null = null;
    if ( parent && checkEntryId(parent) ) {
      parentFolderId = parent;
    }
    entries = entries.filtered('parent == $0', parentFolderId);
  }

  return entries.filtered('name == $0', name);
}
