import { assert, details } from '@agoric/assert';
import { insistCapData } from '../../capdata';
import { makeVatSlot } from '../../parseVatSlots';

export function makeState() {
  const state = {
    nextRemoteIndex: 1,
    remotes: new Map(), // remoteNN -> { remoteID, name, fromRemote/toRemote, etc }
    names: new Map(), // name -> remoteNN

    nextObjectIndex: 10,
    remoteReceivers: new Map(), // o+NN -> remoteNN
    objectTable: new Map(), // o+NN -> owning remote

    // hopefully we can avoid the need for local promises
    // localPromises: new Map(), // p+NN/p-NN -> local purpose
    promiseTable: new Map(), // p+NN/p-NN -> { state, owner, decider, subscriber }
    // and maybe resolution, one of:
    // * {type: 'object', slot}
    // * {type: 'data', data}
    // * {type: 'reject', data}
    nextPromiseIndex: 20,
  };

  return state; // mutable
}

export function dumpState(state) {
  console.log(`Object Table:`);
  for (const id of state.objectTable.keys()) {
    console.log(`${id} : owner=${state.objectTable.get(id)}`);
  }
  console.log();

  console.log(`Promise Table:`);
  for (const id of state.promiseTable.keys()) {
    const p = state.promiseTable.get(id);
    console.log(
      `${id} : owner=${p.owner}, resolved=${p.resolved}, decider=${p.decider}, sub=${p.subscriber}`,
    );
  }
  console.log();

  for (const remoteID of state.remotes.keys()) {
    const r = state.remotes.get(remoteID);
    console.log(`${remoteID} '${r.name}':`);
    for (const inbound of r.fromRemote.keys()) {
      const id = r.fromRemote.get(inbound);
      const outbound = r.toRemote.get(id);
      console.log(` ${inbound} -> ${id} -> ${outbound}`);
    }
  }
}

export function trackUnresolvedPromise(state, remoteID, pid) {
  assert(!state.promiseTable.has(pid), details`${pid} already present`);
  state.promiseTable.set(pid, {
    owner: remoteID,
    state: 'unresolved',
    decider: remoteID,
    subscriber: null,
  });
}

export function allocateUnresolvedPromise(state, remoteID) {
  const index = state.nextPromiseIndex;
  state.nextPromiseIndex += 1;
  const pid = makeVatSlot('promise', true, index);
  trackUnresolvedPromise(state, remoteID, pid);
  return pid;
}

export function setPromiseDecider(state, promiseID, decider) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  state.promiseTable.get(promiseID).decider = decider;
}

export function setPromiseSubscriber(state, promiseID, subscriber) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  state.promiseTable.get(promiseID).subscriber = subscriber;
}

export function insistPromiseIsUnresolved(state, promiseID) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  const pstate = state.promiseTable.get(promiseID).state;
  assert(
    pstate === 'unresolved',
    details`${promiseID} has state ${pstate}, not 'unresolved'`,
  );
}

export function insistPromiseDeciderIs(state, promiseID, remoteID) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  const { decider } = state.promiseTable.get(promiseID);
  assert(
    decider === remoteID,
    details`${promiseID} is decided by ${decider}, not ${remoteID}`,
  );
}

export function insistPromiseDeciderIsMe(state, promiseID) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  const { decider } = state.promiseTable.get(promiseID);
  assert(!decider, details`${decider} is the decider for ${promiseID}, not me`);
}

export function insistPromiseSubscriberIsNotDifferent(
  state,
  promiseID,
  remoteID,
) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  const { subscriber } = state.promiseTable.get(promiseID);
  if (subscriber) {
    assert(
      subscriber === remoteID,
      details`${promiseID} subscriber is ${subscriber}, not ${remoteID}`,
    );
  }
}

export function getPromiseSubscriber(state, promiseID) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  const { subscriber } = state.promiseTable.get(promiseID);
  assert(subscriber, details`${promiseID} has no subscriber`);
  return subscriber;
}

export function markPromiseAsResolved(state, promiseID, resolution) {
  assert(state.promiseTable.has(promiseID), details`unknown ${promiseID}`);
  const p = state.promiseTable.get(promiseID);
  assert(
    p.state === 'unresolved',
    details`${promiseID} is already resolved (${p.state})`,
  );
  if (resolution.type === 'object') {
    assert(resolution.slot, details`resolution(object) requires .slot`);
  } else if (resolution.type === 'data') {
    insistCapData(resolution.data);
  } else if (resolution.type === 'reject') {
    insistCapData(resolution.data);
  } else {
    throw new Error(`unknown resolution type ${resolution.type}`);
  }
  p.state = 'resolved';
  p.resolution = resolution;
  p.decider = undefined;
  p.subscriber = undefined;
}
