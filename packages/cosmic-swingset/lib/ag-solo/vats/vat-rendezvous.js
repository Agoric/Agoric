import { makeRendezvousNamespace } from './rendezvous';

export function buildRootObject() {
  return harden({
    rendezvousServiceFor: makeRendezvousNamespace(),
  });
}