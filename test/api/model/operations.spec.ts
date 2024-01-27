import fs from 'fs';

import { Client } from 'src/api';
import { sleep } from 'src/utils/sleep';

import { createClient } from '../../utils/mock-tg-client';

describe('file and directory operations', () => {
  describe('create / remove directories', () => {
    var client: Client;

    beforeEach(async () => {
      client = await createClient();
    });

    it('should create a directory', async () => {
      const client = await createClient();
      const root = client.getRootDirectory();
      const d1 = await client.createDirectory({ name: 'd1', under: root });
      expect(root.findChildren(['d1'])[0]).toEqual(d1);
    });

    it('should throw an error if the directory name is illegal', async () => {
      const client = await createClient();
      const root = client.getRootDirectory();

      await expect(
        client.createDirectory({ name: '-d1', under: root }),
      ).rejects.toThrowError();
      await expect(
        client.createDirectory({ name: 'd/1', under: root }),
      ).rejects.toThrowError();
    });

    it('should remove a directory', async () => {
      const client = await createClient();
      const root = client.getRootDirectory();

      const d1 = await client.createDirectory({ name: 'd1', under: root });
      await client.dangerouslyDeleteDirectory(d1);
      expect(root.findChildren(['d1'])[0]).toBeUndefined();
    });

    it('should remove all directories', async () => {
      const client = await createClient();

      const d1 = await client.createDirectory({
        name: 'd1',
        under: client.getRootDirectory(),
      });
      await client.createDirectory({ name: 'd2', under: d1 });
      await client.dangerouslyDeleteDirectory(client.getRootDirectory());
      expect(client.getRootDirectory().findChildren(['d1'])[0]).toBeUndefined();
    });
  });

  describe('create / remove files', () => {
    var client: Client;

    beforeEach(async () => {
      client = await createClient();
    });

    it('should create a file', async () => {
      const root = client.getRootDirectory();
      const f1 = await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from('mock-file-content'),
      );
      expect(root.findFiles(['f1'])[0]).toEqual(f1);
    });

    it('should add a file version', async () => {
      const root = client.getRootDirectory();
      await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from('mock-file-content'),
      );

      await sleep(300);
      const content2 = 'mock-file-content-edited';
      await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from(content2),
      );
      const fr = root.findFiles(['f1'])[0];
      const fd = await client.getFileDesc(fr);
      expect(Object.keys(fd.versions)).toHaveLength(2);
      const content = await client.downloadLatestVersion(fr, 'f1');
      expect(content.toString()).toEqual(content2);
    });

    it('should edit a file version', async () => {
      const root = client.getRootDirectory();

      await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from('mock-file-content'),
      );

      const content2 = 'mock-file-content-edited';
      let fr = root.findFiles(['f1'])[0];
      const fd = await client.getFileDesc(fr);

      await client.uploadFile(
        { name: 'f1', under: root, versionId: fd.latestVersionId },
        Buffer.from(content2),
      );

      const content = await client.downloadLatestVersion(fr, 'f1');
      expect(content.toString()).toEqual(content2);
    });

    // it('should not reupload the original file', async () => {
    //   const client = await createClient();
    //   const root = client.getRootDirectory();

    //   const content = 'original file content to test reupload of a same file';

    //   await client.uploadFile(
    //     { name: 'f1', under: root },
    //     Buffer.from(content),
    //   );

    //   await client.uploadFile(
    //     { name: 'f2', under: root },
    //     Buffer.from(content),
    //   );
    // });

    it('should remove a file', async () => {
      const root = client.getRootDirectory();

      const f1 = await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from('mock-file-content'),
      );

      await client.deleteFile(f1);
      expect(root.findFiles(['f1'])[0]).toBeUndefined();
    });

    it('should remove a file version', async () => {
      const root = client.getRootDirectory();
      const content = 'mock-file-content';
      await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from(content),
      );
      await sleep(300);
      await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from('mock-file-content-edited'),
      );

      const fr = root.findFiles(['f1'])[0];
      let f = await client.getFileDesc(fr);

      await client.deleteFile(fr, f.latestVersionId);

      f = await client.getFileDesc(fr);
      expect(Object.keys(f.versions)).toHaveLength(1);
      const content2 = await client.downloadLatestVersion(fr, 'f1');
      expect(content2.toString()).toEqual(content);
    });

    it('should download a file as a local file', async () => {
      const root = client.getRootDirectory();
      const content = 'mock-file-content';
      await client.uploadFile(
        { name: 'f1', under: root },
        Buffer.from(content),
      );

      const fr = root.findFiles(['f1'])[0];
      const localFileName = 'test-download-file-content';

      await client.downloadLatestVersion(fr, 'f1', localFileName);

      const contentRead = fs.readFileSync(localFileName);
      expect(contentRead.toString()).toEqual(content);

      fs.rmSync(localFileName);
    });

    it('should download a file as a write stream', (done) => {
      (async () => {
        const root = client.getRootDirectory();
        const content = 'mock-file-content';
        await client.uploadFile(
          { name: 'f1', under: root },
          Buffer.from(content),
        );

        const fr = root.findFiles(['f1'])[0];
        const localFileName = 'test-download-file-content-2';
        const ws = fs.createWriteStream(localFileName);
        ws.on('finish', () => {
          try {
            const contentRead = fs.readFileSync(localFileName);
            expect(contentRead.toString()).toEqual(content);
            fs.rmSync(localFileName);
            done();
          } catch (err) {
            done(err);
          }
        });

        await client.downloadLatestVersion(fr, 'f1', ws);
      })();
    });
  });
});
