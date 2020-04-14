import anylogger from 'anylogger';
import stableStringify from '@agoric/swingset-vat/src/kernel/json-stable-stringify';

const log = anylogger('block-manager');

const BEGIN_BLOCK = 'BEGIN_BLOCK';
const DELIVER_INBOUND = 'DELIVER_INBOUND';
const END_BLOCK = 'END_BLOCK';
const COMMIT_BLOCK = 'COMMIT_BLOCK';
const IBC_PACKET = 'IBC_PACKET';
const IBC_TIMEOUT = 'IBC_TIMEOUT';

// This works for both *intArray, string, and Buffer.
const getBytesToBase64 = data => Buffer.from(data).toString('base64');

// FIXME: use an immutable Uint8Array.
const getBase64ToBytes = data64 =>
  Uint8Array.from(Buffer.from(data64, 'base64'));

export default function makeBlockManager(
  {
    deliverInbound,
    bridgeInbound,
    // bridgeOutbound
    beginBlock,
    saveChainState,
    saveOutsideState,
    savedActions,
    savedHeight,
  },
  sendToCosmosPort,
) {
  let computedHeight = savedHeight;
  let runTime = 0;
  let ibcHandlerPort = 0;

  const ibcTupleToChannel = new Map();
  const ibcChannelToPort = new Map();

  const getIBCChannel = ({
    ibcHandlerPort: actionIbcHandlerPort,
    tuple: rawTuple,
    channelPort,
  }) => {
    // Update our handler port.
    ibcHandlerPort = actionIbcHandlerPort;

    // Cache according to tuple (never changes during a connection)!
    const tuple = stableStringify(rawTuple);
    let ibcChannel = ibcTupleToChannel.get(tuple);
    if (ibcChannel) {
      ibcChannelToPort.set(ibcChannel, channelPort);
      return ibcChannel;
    }

    const sendToChannelHandler = msg =>
      sendToCosmosPort(
        ibcHandlerPort,
        JSON.stringify({ ...msg, tuple: rawTuple }),
      );

    ibcChannel = {
      // Send a raw packet to this channel.
      send(rawPacket) {
        return sendToChannelHandler({
          method: 'send',
          data64: getBytesToBase64(rawPacket),
        });
      },
      // Ack the current packet.
      ack(reply) {
        return sendToChannelHandler({
          method: 'ack',
          data64: getBytesToBase64(reply),
        });
      },
      // Close the channel.
      close() {
        const ret = sendToChannelHandler({
          method: 'close',
        });
        ibcChannelToPort.delete(ibcChannel);
        ibcTupleToChannel.delete(tuple);
        return ret;
      },
    };

    // Keep this channel associated with a tuple (which stays the same, even after restart).
    ibcTupleToChannel.set(tuple, ibcChannel);
    return ibcChannel;
  };

  async function kernelPerformAction(action) {
    // TODO warner we could change this to run the kernel only during END_BLOCK
    const start = Date.now();
    const finish = _ => (runTime += Date.now() - start);

    let p;
    switch (action.type) {
      case BEGIN_BLOCK:
        p = beginBlock(action.blockHeight, action.blockTime);
        break;

      case DELIVER_INBOUND:
        p = deliverInbound(
          action.peer,
          action.messages,
          action.ack,
          action.blockHeight,
          action.blockTime,
        );
        break;

      // have just one case for all of IBC here

      case IBC_PACKET: {
        console.error(`FIXME: Got IBC packet; just pingpong`, action);
        // action.type, action.subtype
        bridgeInbound(action stuff XXX);

        const ibcChannel = getIBCChannel(action);

        // FIXME: We just ack, send, and disconnect.
        ibcChannel.ack(JSON.stringify(action)); // warner: these create channelMessage structs which are delivered to e.g. ibc.go line 68 in channelHandler.Receive
        ibcChannel.send(`pong:${JSON.stringify(action)}`);
        ibcChannel.close();
        break;
      }

      case IBC_TIMEOUT:
        console.error(`FIXME: Got IBC timeout; not implemented`, action);
        break;

      case END_BLOCK:
        return true;

      default:
        throw new Error(`${action.type} not recognized`);
    }
    p.then(finish, finish);
    return p;
  }

  let currentActions;
  let currentIndex;
  let replaying;
  let decohered;
  let saveTime = 0;

  async function blockManager(action, sendToCosmosPort) {
    if (decohered) {
      throw decohered;
    }

    if (action.type === COMMIT_BLOCK) {
      if (action.blockHeight !== computedHeight) {
        throw Error(
          `Committed height ${action.blockHeight} does not match computed height ${computedHeight}`,
        );
      }

      const start = Date.now();

      // Save the kernel's computed state because we've committed
      // the block (i.e. have obtained consensus on the prior
      // state).
      saveOutsideState(computedHeight, savedActions);
      savedHeight = computedHeight;

      saveTime = Date.now() - start;
      return;
    }

    if (action.type === BEGIN_BLOCK) {
      // Start a new block, or possibly replay the prior one.
      replaying = action.blockHeight === savedHeight;
      currentIndex = 0;
      currentActions = [];
      runTime = 0;
    } else {
      // We're working on a subsequent actions.
      currentIndex += 1;
    }

    currentActions.push(action);

    if (!replaying) {
      // Compute new state by running the kernel.
      await kernelPerformAction(action);
      // eslint-disable-next-line no-use-before-define
    } else if (!deepEquals(action, savedActions[currentIndex])) {
      // Divergence of the inbound messages, so rewind the state if we need to.
      replaying = false;

      // We only handle the trivial case.
      const restoreHeight = action.blockHeight - 1;
      if (restoreHeight !== computedHeight) {
        // Keep throwing forever.
        decohered = Error(
          `Unimplemented reset state from ${computedHeight} to ${restoreHeight}`,
        );
        throw decohered;
      }

      // Replay the saved actions.
      for (const a of currentActions) {
        // eslint-disable-next-line no-await-in-loop
        await kernelPerformAction(a);
        // TODO warner maybe change kernelPerformAction to enqueue but not run the kernel
      }
    }

    if (action.type !== END_BLOCK) {
      return;
    }

    // TODO warner and then actually run the kernel down here, during
    // END_BLOCK, but still reentrancy-protected

    // Commit all the keeper state, even on replay.
    // This is necessary since the block proposer will be asked to validate
    // the actions it just proposed (in Tendermint v0.33.0).
    const start = Date.now();
    const { mailboxSize } = saveChainState();
    const mbTime = Date.now() - start;

    // Advance our saved state variables.
    savedActions = currentActions;
    computedHeight = action.blockHeight;

    log.debug(
      `wrote SwingSet checkpoint (mailbox=${mailboxSize}), [run=${runTime}ms, mb=${mbTime}ms, save=${saveTime}ms]`,
    );
  }

  return blockManager;
}

// TODO: Put this somewhere else.
function deepEquals(a, b, already = new WeakSet()) {
  if (Object.is(a, b)) {
    return true;
  }

  // Must both be objects.
  if (Object(a) !== a || Object(b) !== b) {
    return false;
  }

  // That we haven't seen before.
  if (already.has(a) || already.has(b)) {
    return false;
  }
  already.add(a);
  already.add(b);

  // With the same prototype.
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    return false;
  }

  // And deepEquals entries.
  const amap = new Map(Object.entries(a));
  for (const [key, bval] of Object.entries(b)) {
    if (!amap.has(key)) {
      return false;
    }
    if (!deepEquals(amap.get(key), bval, already)) {
      return false;
    }
    amap.delete(key);
  }

  // And no extra keys in b.
  if (amap.size > 0) {
    return false;
  }
  return true;
}
