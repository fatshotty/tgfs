import {join, resolve, dirname} from 'node:path';
import { config } from 'src/config';
import { Logger } from 'src/utils/logger';
import Realm, { ObjectSchema, Configuration, Results, BSON } from 'realm';


class Entry extends Realm.Object {
  static NAME = 'Entry';

  _id?: string;
  internalId!: string;
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


function getEntryByID(fId: string | {_id: string}) {
  let pId = '';
  if ( fId._id ) {
    pId = fId._id;
  } else if ( typeof parent === 'string' ) {
    pId = parent;
  }

  const p = DB.objectForPrimaryKey(Entry.NAME, pId);
  if ( !p ) {
    throw new Error(`cannot find folder by id: ${pId}`);
  }

  return p;
}


export function createFolder(parent, name) : void {

  let parentFolderId = null; // default: root folder
  if ( parent ) {
    parentFolderId = getEntryByID(parent)._id;
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

  DB.write(() => {
    DB.create(Entry.NAME, entry, Realm.UpdateMode.Modified);
  });
}

export function listSubfolder(parent) : Results<any> {

  let parentFolderId = null; // default: root folder
  if ( parent ) {
    parentFolderId = getEntryByID(parent)._id;
  }

  const objs = DB.objects<Entry>( Entry.NAME );
  return objs.filtered('parent == $0', parentFolderId);
}


export function findByName(parent: string | null | Entry, name: string, all = false) : Results<any> {

  let entries = DB.objects<Entry>( Entry.NAME );

  if ( !all ) {
    let parentFolderId = null;
    if ( parent ) {
      parentFolderId = getEntryByID( parent )._id;
    }
    entries = entries.filtered('parent == $0', parentFolderId);
  }

  entries = entries.filtered('name CONTAINS[c] $0', name);

  return entries;
}
