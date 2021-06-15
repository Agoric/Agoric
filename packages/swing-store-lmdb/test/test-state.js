// import LMDB before SES lockdown, as workaround for
// https://github.com/Agoric/SES-shim/issues/308
import 'node-lmdb';
import '@agoric/install-ses';

import fs from 'fs';

import test from 'ava';
import { getAllState } from '@agoric/swing-store-simple';

import {
  initLMDBSwingStore,
  openLMDBSwingStore,
  isSwingStore,
} from '../src/lmdbSwingStore.js';

function testKVStore(t, store) {
  const kvStore = store.kvStore;
  t.falsy(kvStore.has('missing'));
  t.is(kvStore.get('missing'), undefined);

  kvStore.set('foo', 'f');
  t.truthy(kvStore.has('foo'));
  t.is(kvStore.get('foo'), 'f');

  kvStore.set('foo2', 'f2');
  kvStore.set('foo1', 'f1');
  kvStore.set('foo3', 'f3');
  t.deepEqual(Array.from(kvStore.getKeys('foo1', 'foo3')), ['foo1', 'foo2']);
  t.deepEqual(Array.from(kvStore.getKeys('foo1', 'foo4')), [
    'foo1',
    'foo2',
    'foo3',
  ]);

  kvStore.delete('foo2');
  t.falsy(kvStore.has('foo2'));
  t.is(kvStore.get('foo2'), undefined);
  t.deepEqual(Array.from(kvStore.getKeys('foo1', 'foo4')), ['foo1', 'foo3']);

  const reference = {
    kvStuff: {
      foo: 'f',
      foo1: 'f1',
      foo3: 'f3',
    },
    streamStuff: new Map(),
  };
  t.deepEqual(getAllState(store), reference, 'check state after changes');
}

test('storageInLMDB under SES', t => {
  const dbDir = 'testdb';
  t.teardown(() => fs.rmdirSync(dbDir, { recursive: true }));
  fs.rmdirSync(dbDir, { recursive: true });
  t.is(isSwingStore(dbDir), false);
  const store = initLMDBSwingStore(dbDir);
  const { commit, close } = store;
  testKVStore(t, store);
  commit();
  const before = getAllState(store);
  close();
  t.is(isSwingStore(dbDir), true);

  const store2 = openLMDBSwingStore(dbDir);
  const { close: close2 } = store2;
  t.deepEqual(getAllState(store2), before, 'check state after reread');
  t.is(isSwingStore(dbDir), true);
  close2();
});

test('streamStore read/write', t => {
  const dbDir = 'testdb';
  t.teardown(() => fs.rmdirSync(dbDir, { recursive: true }));
  fs.rmdirSync(dbDir, { recursive: true });
  t.is(isSwingStore(dbDir), false);
  const { streamStore, commit, close } = initLMDBSwingStore(dbDir);

  const start = streamStore.STREAM_START;
  let s1pos = start;
  s1pos = streamStore.writeStreamItem('st1', 'first', s1pos);
  s1pos = streamStore.writeStreamItem('st1', 'second', s1pos);
  const s1posAlt = { ...s1pos };
  s1pos = streamStore.writeStreamItem('st1', 'third', s1pos);
  let s2pos = streamStore.STREAM_START;
  s2pos = streamStore.writeStreamItem('st2', 'oneth', s2pos);
  s1pos = streamStore.writeStreamItem('st1', 'fourth', s1pos);
  s2pos = streamStore.writeStreamItem('st2', 'twoth', s2pos);
  const s2posAlt = { ...s2pos };
  s2pos = streamStore.writeStreamItem('st2', 'threeth', s2pos);
  s2pos = streamStore.writeStreamItem('st2', 'fourst', s2pos);
  streamStore.closeStream('st1');
  streamStore.closeStream('st2');
  const reader1 = streamStore.readStream('st1', start, s1pos);
  t.deepEqual(Array.from(reader1), ['first', 'second', 'third', 'fourth']);
  s2pos = streamStore.writeStreamItem('st2', 're3', s2posAlt);
  streamStore.closeStream('st2');
  const reader2 = streamStore.readStream('st2', start, s2pos);
  t.deepEqual(Array.from(reader2), ['oneth', 'twoth', 're3']);

  const reader1alt = streamStore.readStream('st1', s1posAlt, s1pos);
  t.deepEqual(Array.from(reader1alt), ['third', 'fourth']);

  const emptyPos = streamStore.writeStreamItem('empty', 'filler', start);
  streamStore.closeStream('empty');
  const readerEmpty = streamStore.readStream('empty', emptyPos, emptyPos);
  t.deepEqual(Array.from(readerEmpty), []);
  const readerEmpty2 = streamStore.readStream('empty', start, start);
  t.deepEqual(Array.from(readerEmpty2), []);

  commit();
  close();
});

test('streamStore mode interlock', t => {
  const dbDir = 'testdb';
  t.teardown(() => fs.rmdirSync(dbDir, { recursive: true }));
  fs.rmdirSync(dbDir, { recursive: true });
  t.is(isSwingStore(dbDir), false);
  const { streamStore, commit, close } = initLMDBSwingStore(dbDir);
  const start = streamStore.STREAM_START;

  const s1pos = streamStore.writeStreamItem('st1', 'first', start);

  t.throws(() => streamStore.readStream('st1', start, s1pos), {
    message: `can't read stream "st1" because it's already in use`,
  });
  streamStore.closeStream('st1');

  const reader = streamStore.readStream('st1', start, s1pos);
  t.throws(() => streamStore.readStream('st1', start, s1pos), {
    message: `can't read stream "st1" because it's already in use`,
  });
  t.throws(() => streamStore.writeStreamItem('st1', start, s1pos), {
    message: `can't write stream "st1" because it's already in use`,
  });
  streamStore.closeStream('st1');
  t.throws(() => reader.next(), {
    message: `can't read stream "st1", it's been closed`,
  });

  streamStore.closeStream('nonexistent');

  commit();
  close();
});
