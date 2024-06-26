import { saveToBuffer } from 'src/api/utils';
import { TGFSDirectory } from 'src/model/directory';
import { TGFSMetadata } from 'src/model/metadata';

import { FileDescApi } from './file-desc-api';

export class MetaDataApi extends FileDescApi {
  private metadata: TGFSMetadata;
  private updateMetaDataTimeout: NodeJS.Timeout = null;

  protected async initMetadata() {
    this.metadata = await this.getMetadata();
    if (!this.metadata) {
      this.metadata = new TGFSMetadata();
    }
  }

  protected async resetMetadata() {
    this.metadata.dir = new TGFSDirectory('root', null);
  }

  protected async getMetadata() {
    const pinnedMessage = (
      await this.tdlib.account.getPinnedMessages({
        chatId: this.privateChannelId,
      })
    )[0];

    if (!pinnedMessage) {
      return null;
    }
    const metadata = TGFSMetadata.fromObject(
      JSON.parse(
        String(
          await saveToBuffer(
            this.downloadFile('metadata.json', pinnedMessage.messageId),
          ),
        ),
      ),
    );
    metadata.msgId = pinnedMessage.messageId;
    return metadata;
  }

  protected async syncMetadata() {
    this.metadata.syncWith(await this.getMetadata());
    await this.updateMetadata();
  }

  protected async updateMetadata(): Promise<undefined> {
    const buffer = Buffer.from(JSON.stringify(this.metadata.toObject()));
    if (this.metadata.msgId) {
      // update current metadata
      await this.editMessageMedia(
        this.metadata.msgId,
        buffer,
        'metadata.json',
        '',
      );
      // return new Promise((resolve, reject) => {
      //   if (this.updateMetaDataTimeout) {
      //     clearTimeout(this.updateMetaDataTimeout);
      //   }
      //   this.updateMetaDataTimeout = setTimeout(async () => {
      //     try {

      //       resolve(undefined);
      //     } catch (err) {
      //       reject(err);
      //     }
      //   }, 1000);
      // });
    } else {
      // doesn't exist, create new metadata and pin
      const { messageId } = await this.sendFile({
        buffer,
        name: 'metadata.json',
      });
      this.metadata.msgId = messageId;
      await this.pinMessage(messageId);
    }
  }

  public getRootDirectory() {
    return this.metadata.dir;
  }
}
