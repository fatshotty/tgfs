import { TGFSDirectory, TGFSFileRef } from 'src/model/directory';
import { TGFSFileVersion } from 'src/model/file';
import { TGFSFile } from 'src/model/file';
import { validateName } from 'src/utils/validate-name';

import { DirectoryApi } from './directory-api';
import { GeneralFileMessage } from './message-api/types';

export class FileApi extends DirectoryApi {
  public async copyFile(
    where: TGFSDirectory,
    fr: TGFSFileRef,
    name?: string,
  ): Promise<TGFSFileRef> {
    const copiedFR = where.createFileRef(name ?? fr.name, fr.getMessageId());
    await this.syncMetadata();
    return copiedFR;
  }

  private async createFile(
    where: TGFSDirectory,
    fileMsg: GeneralFileMessage,
  ): Promise<TGFSFile> {
    validateName(fileMsg.name);

    const { messageId, fd } = await this.createFileDesc(fileMsg);
    where.createFileRef(fileMsg.name, messageId);
    await this.syncMetadata();
    return fd;
  }

  private async updateFileRefMessageIdIfNecessary(
    fr: TGFSFileRef,
    messageId: number,
  ): Promise<void> {
    if (fr.getMessageId() !== messageId) {
      // original file description message is gone
      fr.setMessageId(messageId);
      await this.syncMetadata();
    }
  }

  private async updateFile(
    fr: TGFSFileRef,
    fileMsg: GeneralFileMessage,
    versionId?: string,
  ): Promise<TGFSFile> {
    const { messageId, fd } = versionId
      ? await this.updateFileVersion(fr, fileMsg, versionId)
      : await this.addFileVersion(fr, fileMsg);
    await this.updateFileRefMessageIdIfNecessary(fr, messageId);
    return fd;
  }

  public async deleteFile(fr: TGFSFileRef, version?: string): Promise<void> {
    if (!version) {
      fr.delete();
      await this.syncMetadata();
    } else {
      const { messageId, fd } = await this.deleteFileVersion(fr, version);
      await this.updateFileRefMessageIdIfNecessary(fr, messageId);
    }
  }

  public async uploadFile(
    where: {
      under: TGFSDirectory;
      versionId?: string;
    },
    fileMsg?: GeneralFileMessage,
  ): Promise<TGFSFile> {
    const fr = where.under.findFiles([fileMsg.name])[0];
    if (fr) {
      return await this.updateFile(fr, fileMsg, where.versionId);
    } else {
      return await this.createFile(where.under, fileMsg);
    }
  }

  public async *downloadLatestVersion(
    fr: TGFSFileRef,
    asName: string,
  ): AsyncGenerator<Buffer> {
    const fd = await this.getFileDesc(fr);

    if (fd.isEmptyFile()) {
      yield Buffer.from('');
    } else {
      const version = fd.getLatest();
      yield* this.downloadFileVersion(version, asName);
    }
  }

  public downloadFileVersion(
    fv: TGFSFileVersion,
    asName: string,
  ): AsyncGenerator<Buffer> {
    return this.downloadFile(asName, fv.messageId);
  }
}
