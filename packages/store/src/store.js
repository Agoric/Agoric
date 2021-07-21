// Copyright (C) 2019 Agoric, under Apache license 2.0

// @ts-check

import { assert, details as X, q } from '@agoric/assert';
import { passStyleOf } from '@agoric/marshal';
import { mustBeComparable } from '../../same-structure';

/**
 * Distinguishes between adding a new key (init) and updating or
 * referencing a key (get, set, delete).
 *
 * `init` is only allowed if the key does not already exist. `Get`,
 * `set` and `delete` are only allowed if the key does already exist.
 *
 * @template K,V
 * @param  {string} [keyName='key'] - the column name for the key
 * @returns {Store<K,V>}
 */
export function makeStore(keyName = 'key') {
  const store = new Map();
  const assertKeyDoesNotExist = key =>
    assert(!store.has(key), X`${q(keyName)} already registered: ${key}`);
  const assertKeyExists = key =>
    assert(store.has(key), X`${q(keyName)} not found: ${key}`);
  return harden({
    has: key => {
      mustBeComparable(key);
      return store.has(key);
    },
    init: (key, value) => {
      mustBeComparable(key);
      passStyleOf(value);
      assertKeyDoesNotExist(key);
      store.set(key, value);
    },
    get: key => {
      mustBeComparable(key);
      assertKeyExists(key);
      return store.get(key);
    },
    set: (key, value) => {
      mustBeComparable(key);
      passStyleOf(value);
      assertKeyExists(key);
      store.set(key, value);
    },
    delete: key => {
      mustBeComparable(key);
      assertKeyExists(key);
      store.delete(key);
    },
    keys: () => Array.from(store.keys()),
    values: () => Array.from(store.values()),
    entries: () => Array.from(store.entries()),
  });
}
harden(makeStore);
