import path from 'path';
import fs from 'fs';

import { initLMDBSwingStore } from '@agoric/swing-store-lmdb';

export default async function resetState(basedir) {
  const mailboxStateFile = path.resolve(
    basedir,
    'swingset-kernel-mailbox.json',
  );
  fs.writeFileSync(mailboxStateFile, `{}\n`);
  const kernelStateDBDir = path.join(basedir, 'swingset-kernel-state');
  const { commit, close } = initLMDBSwingStore(kernelStateDBDir);
  commit();
  close();
}
