import { assert, details, q } from '@agoric/assert';
import { parseVatSlot } from '../parseVatSlots';

export function makeVirtualObjectManager(
  syscall,
  allocateExportID,
  valToSlotTable,
  m,
  cacheSize,
) {
  /**
   * Make a simple LRU cache of virtual object inner selves.
   *
   * @param {number} size  Maximum number of entries to keep in the cache before
   *    starting to throw them away.
   */
  function makeCache(size) {
    let lruHead;
    let lruTail;
    let count = 0;
    const liveTable = new Map();

    const cache = {
      makeRoom() {
        while (count > size && lruTail) {
          liveTable.delete(lruTail.instanceKey);
          lruTail.dropData();
          if (lruTail.prev) {
            lruTail.prev.next = undefined;
          } else {
            lruHead = undefined;
          }
          lruTail = lruTail.prev;
          count -= 1;
        }
      },
      flush() {
        const saveSize = size;
        size = 0;
        cache.makeRoom();
        size = saveSize;
      },
      remember(innerObj) {
        if (liveTable.has(innerObj.instanceKey)) {
          return;
        }
        liveTable.set(innerObj.instanceKey, innerObj);
        innerObj.prev = undefined;
        cache.makeRoom();
        innerObj.next = lruHead;
        if (lruHead) {
          lruHead.prev = innerObj;
        }
        lruHead = innerObj;
        if (!lruTail) {
          lruTail = innerObj;
        }
        count += 1;
      },
      refresh(innerObj) {
        if (innerObj !== lruHead) {
          const oldPrev = innerObj.prev;
          const oldNext = innerObj.next;
          if (oldPrev) {
            oldPrev.next = oldNext;
          } else {
            lruHead = oldNext;
          }
          if (oldNext) {
            oldNext.prev = oldPrev;
          } else {
            lruTail = oldPrev;
          }
          innerObj.prev = undefined;
          innerObj.next = lruHead;
          lruHead.prev = innerObj;
          lruHead = innerObj;
        }
      },
      lookup(instanceKey) {
        return liveTable.get(instanceKey);
      },
    };
    return cache;
  }

  const cache = makeCache(cacheSize);

  /**
   * Map from virtual object kind IDs to reanimator functions for the
   * corresponding kinds of virtual objects.
   */
  const kindTable = new Map();

  /**
   * Produce a representative given an instance key.  Used for deserializing.
   *
   * @param {string} vref  The instanceID of the object being dereferenced
   *
   * @returns {*}  A representative of the object identified by `vref`
   */
  function makeVirtualObjectRepresentative(vref) {
    const { id } = parseVatSlot(vref);
    const kindID = `${id}`;
    const reanimator = kindTable.get(kindID);
    if (reanimator) {
      return reanimator(vref);
    } else {
      throw Error(`unknown kind ${kindID}`);
    }
  }

  let nextWeakStoreID = 1;

  /**
   * This is essentially a copy of makeWeakStore from the @agoric/store package,
   * modified to key a virtual object representative using its instanceID
   * (rather than its object identity) and stash the corresponding value in
   * persistent storage.  Note this means that (1) non-virtual objects all
   * continue to be tracked in an in-memory WeakMap, meaning the keys are held
   * weakly but table size is bounded by memory capacity, while (2) virtual
   * objects are not actually held weakly and so will never (at this point) be
   * garbage collected since there's no way to tell when they keys become
   * unreferenced.
   *
   * This should be considered a placeholder for developmental purposes.  It is
   * not integrated with the regular @agoric/store package in a general way.
   *
   * @template {Record<any, any>} K
   * @template {any} V
   *
   * @param {string} [keyName='key']
   *
   * @returns {WeakStore<K, V>}
   */
  function makeWeakStore(keyName = 'key') {
    const backingMap = new WeakMap();
    const storeID = nextWeakStoreID;
    nextWeakStoreID += 1;

    function assertKeyDoesNotExist(key) {
      assert(
        !backingMap.has(key),
        details`${q(keyName)} already registered: ${key}`,
      );
    }

    function assertKeyExists(key) {
      assert(backingMap.has(key), details`${q(keyName)} not found: ${key}`);
    }

    function virtualObjectKey(key) {
      const instanceKey = valToSlotTable.get(key);
      if (!instanceKey) {
        return undefined;
      } else {
        const { type, virtual } = parseVatSlot(instanceKey);
        if (type === 'object' && virtual) {
          return `ws${storeID}.${instanceKey}`;
        } else {
          return undefined;
        }
      }
    }

    return harden({
      has(key) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          return !!syscall.vatstoreGet(vkey);
        } else {
          return backingMap.has(key);
        }
      },
      init(key, value) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          assert(
            !syscall.vatstoreGet(vkey),
            details`${q(keyName)} already registered: ${key}`,
          );
          syscall.vatstoreSet(vkey, JSON.stringify(m.serialize(value)));
        } else {
          assertKeyDoesNotExist(key);
          backingMap.set(key, value);
        }
      },
      get(key) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          const rawValue = syscall.vatstoreGet(vkey);
          assert(rawValue, details`${q(keyName)} not found: ${key}`);
          return m.unserialize(JSON.parse(rawValue));
        } else {
          assertKeyExists(key);
          return backingMap.get(key);
        }
      },
      set(key, value) {
        const vkey = virtualObjectKey(key);
        if (vkey) {
          assert(
            syscall.vatstoreGet(vkey),
            details`${q(keyName)} not found: ${key}`,
          );
          syscall.vatstoreSet(vkey, JSON.stringify(m.serialize(harden(value))));
        } else {
          assertKeyExists(vkey);
          backingMap.set(key, value);
        }
      },
    });
  }

  /**
   * Fetch an object's state from secondary storage.
   *
   * @param {string} instanceKey  The instance ID of the object whose state is
   *    being fetched.
   *
   * @returns {*} an object representing the object's stored state.
   */
  function fetch(instanceKey) {
    return JSON.parse(syscall.vatstoreGet(instanceKey));
  }

  /**
   * Write an object's state to secondary storage.
   *
   * @param {string} instanceKey  The instance ID of the object whose state is
   *    being stored.
   * @param {*} rawData  A data object representing the state to be written.
   */
  function store(instanceKey, rawData) {
    syscall.vatstoreSet(instanceKey, JSON.stringify(rawData));
  }

  /**
   * Make a new kind of virtual object.
   *
   * @param {*} instanceMaker  A function of the form `instanceMaker(state)` that
   *    will return a representative instance wrapped around the given state.
   *
   * @returns {*} a maker function that can be called to manufacture new
   *    instance of this kind of object.  The parameters of the maker function
   *    are those of the `initialize` method implemented in the representative
   *    produced by the `instanceMaker` parameter.
   */
  function makeKind(instanceMaker) {
    const kindID = `${allocateExportID()}`;
    let nextInstanceID = 1;

    function makeInnerSelf(instanceKey, rawData) {
      const innerSelf = {
        prev: undefined,
        next: undefined,
        instanceKey,
        rawData,
        dropData() {
          store(instanceKey, innerSelf.rawData);
          innerSelf.rawData = null;
        },
      };
      return innerSelf;
    }

    function makeRepresentative(innerSelf, initArgs) {
      function ensureState() {
        if (!innerSelf.rawData) {
          const instanceKey = innerSelf.instanceKey;
          innerSelf = cache.lookup(instanceKey);
          if (!innerSelf) {
            innerSelf = makeInnerSelf(instanceKey, fetch(instanceKey));
            cache.remember(innerSelf);
          }
        }
        cache.refresh(innerSelf);
      }

      function wrapData() {
        innerSelf.activeData = {};
        for (const prop of Object.getOwnPropertyNames(innerSelf.rawData)) {
          Object.defineProperty(innerSelf.activeData, prop, {
            get: () => {
              ensureState();
              return m.unserialize(innerSelf.rawData[prop]);
            },
            set: value => {
              ensureState();
              innerSelf.rawData[prop] = m.serialize(value);
            },
          });
        }
        return harden(innerSelf.activeData);
      }

      if (!innerSelf.rawData && initArgs) {
        innerSelf.rawData = {};
        const tempInstance = instanceMaker(innerSelf.rawData);
        tempInstance.initialize(...initArgs);
        for (const prop of Object.getOwnPropertyNames(innerSelf.rawData)) {
          innerSelf.rawData[prop] = m.serialize(innerSelf.rawData[prop]);
        }
      }
      if (!innerSelf.activeData) {
        wrapData();
      }
      const rawRepresentative = instanceMaker(innerSelf.activeData);
      delete rawRepresentative.initialize;
      const representative = harden(rawRepresentative);
      cache.remember(innerSelf);
      valToSlotTable.set(representative, innerSelf.instanceKey);
      return representative;
    }

    function reanimate(instanceKey) {
      let innerSelf = cache.lookup(instanceKey);
      if (!innerSelf) {
        innerSelf = makeInnerSelf(instanceKey, fetch(instanceKey));
      }
      return makeRepresentative(innerSelf);
    }
    kindTable.set(kindID, reanimate);

    function makeNewInstance(...args) {
      const instanceKey = `o+${kindID}/${nextInstanceID}`;
      nextInstanceID += 1;

      const innerSelf = makeInnerSelf(instanceKey, null);
      return makeRepresentative(innerSelf, args);
    }

    return makeNewInstance;
  }

  return harden({
    makeWeakStore,
    makeKind,
    flushCache: cache.flush,
    makeVirtualObjectRepresentative,
  });
}
