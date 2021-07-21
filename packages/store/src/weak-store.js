// Copyright (C) 2019 Agoric, under Apache license 2.0

// @ts-check

import { assert, details as X, q } from '@agoric/assert';
import { passStyleOf } from '@agoric/marshal';
import { mustBeComparable } from '../../same-structure';
import './types.js';

const assertKey = key => {
  harden(key); // TODO: Just a transition kludge. Remove when possible.
  mustBeComparable(key);
};

const assertValue = value => {
  harden(value); // TODO: Just a transition kludge. Remove when possible.
  passStyleOf(value); // asserts that value is passable
};

/**
 * @template {Record<any, any>} K
 * @template {any} V
 * @param {string} [keyName='key']
 * @returns {WeakStore<K, V>}
 */
export function makeWeakStore(keyName = 'key') {
  const wm = new WeakMap();
  const assertKeyDoesNotExist = key =>
    assert(!wm.has(key), X`${q(keyName)} already registered: ${key}`);
  const assertKeyExists = key =>
    assert(wm.has(key), X`${q(keyName)} not found: ${key}`);
  return harden({
    has: key => {
      assertKey(key);
      return wm.has(key);
    },
    init: (key, value) => {
      assertKey(key);
      assertValue(value);
      assertKeyDoesNotExist(key);
      wm.set(key, value);
    },
    get: key => {
      assertKey(key);
      assertKeyExists(key);
      return wm.get(key);
    },
    set: (key, value) => {
      assertKey(key);
      assertValue(value);
      assertKeyExists(key);
      wm.set(key, value);
    },
    delete: key => {
      assertKey(key);
      assertKeyExists(key);
      wm.delete(key);
    },
  });
}
harden(makeWeakStore);
