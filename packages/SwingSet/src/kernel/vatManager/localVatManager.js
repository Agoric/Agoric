/* global harden */
import { assert } from '@agoric/assert';
import { importBundle } from '@agoric/import-bundle';
import { makeLiveSlots } from '../liveSlots';
import { createSyscall } from './syscall';
import { makeDeliver } from './deliver';
import { makeTranscriptManager } from './transcript';

export function makeLocalVatManagerFactory(tools) {
  const {
    allVatPowers,
    kernelKeeper,
    makeVatEndowments,
    meterManager,
    transformMetering,
    waitUntilQuiescent,
  } = tools;

  const { makeGetMeter, refillAllMeters, stopGlobalMeter } = meterManager;
  const baseVP = {
    Remotable: allVatPowers.Remotable,
    getInterfaceOf: allVatPowers.getInterfaceOf,
    transformTildot: allVatPowers.transformTildot,
  };
  const internalMeteringVP = {
    makeGetMeter: allVatPowers.makeGetMeter,
    transformMetering: allVatPowers.transformMetering,
  };
  // testLog is also a vatPower, only for unit tests

  function prepare(vatID, managerOptions = {}) {
    const { notifyTermination = undefined } = managerOptions;
    const vatKeeper = kernelKeeper.allocateVatKeeperIfNeeded(vatID);
    const transcriptManager = makeTranscriptManager(
      kernelKeeper,
      vatKeeper,
      vatID,
    );
    const { syscall, setVatSyscallHandler } = createSyscall(transcriptManager);
    function finish(dispatch, meterRecord) {
      assert(
        dispatch && dispatch.deliver,
        `vat failed to return a 'dispatch' with .deliver: ${dispatch}`,
      );
      const { deliver, replayTranscript } = makeDeliver(
        {
          vatID,
          stopGlobalMeter,
          notifyTermination,
          meterRecord,
          refillAllMeters,
          transcriptManager,
          vatKeeper,
          waitUntilQuiescent,
        },
        dispatch,
      );

      function shutdown() {
        // local workers don't need anything special to shut down between turns
      }

      const manager = harden({
        replayTranscript,
        setVatSyscallHandler,
        deliver,
        shutdown,
      });
      return manager;
    }
    return { syscall, finish };
  }

  function createFromSetup(vatID, setup, managerOptions) {
    assert(!managerOptions.metered, `unsupported`);
    assert(!managerOptions.enableInternalMetering, `unsupported`);
    assert(!managerOptions.notifyTermination, `unsupported`);
    assert(setup instanceof Function, 'setup is not an in-realm function');
    const { syscall, finish } = prepare(vatID, managerOptions);

    const helpers = harden({}); // DEPRECATED, todo remove from setup()
    const state = null; // TODO remove from setup()
    const vatPowers = harden({ ...baseVP, testLog: allVatPowers.testLog });
    const dispatch = setup(syscall, state, helpers, vatPowers);
    const meterRecord = null;
    return finish(dispatch, meterRecord);
  }

  async function createFromBundle(vatID, bundle, managerOptions) {
    const {
      metered = false,
      notifyTermination,
      enableSetup = false,
      enableInternalMetering = false,
      vatParameters = {},
    } = managerOptions;

    let meterRecord = null;
    if (metered) {
      // fail-stop: we refill the meter after each crank (in vatManager
      // doProcess()), but if the vat exhausts its meter within a single
      // crank, it will never run again. We set refillEachCrank:false because
      // we want doProcess to do the refilling itself, so it can count the
      // usage
      meterRecord = makeGetMeter({
        refillEachCrank: false,
        refillIfExhausted: false,
      });
    }

    const inescapableTransforms = [];
    const inescapableGlobalLexicals = {};
    if (metered) {
      const getMeter = meterRecord.getMeter;
      inescapableTransforms.push(src => transformMetering(src, getMeter));
      inescapableGlobalLexicals.getMeter = getMeter;
    }

    const vatNS = await importBundle(bundle, {
      filePrefix: vatID,
      endowments: makeVatEndowments(vatID),
      inescapableTransforms,
      inescapableGlobalLexicals,
    });

    const { syscall, finish } = prepare(vatID, { notifyTermination });
    const imVP = enableInternalMetering ? internalMeteringVP : {};
    const vatPowers = harden({
      ...baseVP,
      ...imVP,
      testLog: allVatPowers.testLog,
    });
    const state = null; // TODO remove from makeLiveSlots()

    let dispatch;
    if (typeof vatNS.buildRootObject === 'function') {
      const { buildRootObject } = vatNS;
      dispatch = makeLiveSlots(
        syscall,
        state,
        buildRootObject,
        vatID,
        vatPowers,
        vatParameters,
      );
    } else {
      const setup = vatNS.default;
      assert(setup, `vat source bundle lacks (default) setup() function`);
      assert(setup instanceof Function, `setup is not a function`);
      assert(enableSetup, `got setup(), but not options.enableSetup`);
      const helpers = harden({}); // DEPRECATED, todo remove from setup()
      dispatch = setup(syscall, state, helpers, vatPowers);
    }
    return finish(dispatch, meterRecord);
  }

  const localVatManagerFactory = harden({
    createFromBundle,
    createFromSetup,
  });
  return localVatManagerFactory;
}
