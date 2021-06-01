// @ts-check

// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/zoe/tools/prepare-test-env-ava';

import { Far } from '@agoric/marshal';

import { setupCreateZCFVat } from '../../../src/zoeService/createZCFVat';

test('setupCreateZCFVat', async t => {
  // This is difficult to unit test, since the real functionality
  // creates a new vat

  const fakeVatAdminSvc = Far('fakeVatAdminSvc', {
    createVatByName: name => name,
    createVat: _bundle => 'zcfBundle',
  });

  // @ts-ignore fakeVatAdminSvc is mocked
  t.is(await setupCreateZCFVat(fakeVatAdminSvc, undefined)(), 'zcfBundle');
  // @ts-ignore fakeVatAdminSvc is mocked
  t.is(await setupCreateZCFVat(fakeVatAdminSvc, 'myVat')(), 'myVat');
});
