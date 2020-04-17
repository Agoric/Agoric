import harden from '@agoric/harden';
import { allComparable } from '@agoric/same-structure';
import {
  makeLoopbackInterfaceHandler,
  makeEchoConnectionHandler,
} from '@agoric/swingset-vat/src/vats/network';

// this will return { undefined } until `ag-solo set-gci-ingress`
// has been run to update gci.js
import { GCI } from './gci';
// import { makeIBCInterfaceHandler } from './ibc';
import { makeBridgeManager } from './bridge';

console.debug(`loading bootstrap.js`);

function parseArgs(argv) {
  let ROLE;
  let gotRoles = false;
  let bootAddress;
  const additionalAddresses = [];
  argv.forEach(arg => {
    const match = arg.match(/^--role=(.*)$/);
    if (match) {
      if (gotRoles) {
        throw new Error(`must assign only one role, saw ${ROLE}, ${match[1]}`);
      }
      [, ROLE] = match;
      gotRoles = true;
    } else if (!arg.match(/^-/)) {
      if (!bootAddress) {
        bootAddress = arg;
      } else {
        additionalAddresses.push(arg);
      }
    }
  });
  if (!gotRoles) {
    ROLE = 'three_client';
  }

  return [ROLE, bootAddress, additionalAddresses];
}

// Used in scenario 1 for coordinating on an index for registering public keys
// while requesting provisioning.
const KEY_REG_INDEX = 1;
// Used for coordinating on an index in comms for the provisioning service
const PROVISIONER_INDEX = 1;

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    (E, D) => {
      async function setupCommandDevice(httpVat, cmdDevice, roles) {
        await E(httpVat).setCommandDevice(cmdDevice, roles);
        D(cmdDevice).registerInboundHandler(httpVat);
      }

      async function setupWalletVat(httpObj, httpVat, walletVat) {
        await E(httpVat).registerURLHandler(walletVat, '/private/wallet');
        const bridgeURLHandler = await E(walletVat).getBridgeURLHandler();
        await E(httpVat).registerURLHandler(
          bridgeURLHandler,
          '/private/wallet-bridge',
        );
        await E(walletVat).setHTTPObject(httpObj);
        await E(walletVat).setPresences();
      }

      // Make services that are provided on the real or virtual chain side
      async function makeChainBundler(vats, timerDevice) {
        // Create singleton instances.
        const sharingService = await E(vats.sharing).getSharingService();
        const registry = await E(vats.registrar).getSharedRegistrar();
        const chainTimerService = await E(vats.timer).createTimerService(
          timerDevice,
        );

        const zoe = await E(vats.zoe).getZoe();
        const contractHost = await E(vats.host).makeHost();

        // Make the other demo mints
        const issuerNames = ['moola', 'simolean'];
        const issuers = await Promise.all(
          issuerNames.map(issuerName =>
            E(vats.mints).makeMintAndIssuer(issuerName),
          ),
        );

        // Register all of the starting issuers.
        const issuerInfo = await Promise.all(
          issuerNames.map(async (issuerName, i) =>
            harden({
              issuer: issuers[i],
              petname: issuerName,
              brandRegKey: await E(registry).register(
                issuerName,
                await E(issuers[i]).getBrand(),
              ),
            }),
          ),
        );
        return harden({
          async createUserBundle(_nickname) {
            // Bind to a fresh port (unspecified name) on the IBC implementation
            // and provide it for the user to have.
            const ibcport = await E(vats.network).bind('/ibc/*/ordered/');
            const bundle = harden({
              chainTimerService,
              sharingService,
              contractHost,
              ibcport,
              registrar: registry,
              registry,
              zoe,
            });

            const payments = await E(vats.mints).mintInitialPayments(
              issuerNames,
              harden([1900, 1900]),
            );

            // return payments and issuerInfo separately from the
            // bundle so that they can be used to initialize a wallet
            // per user
            return harden({ payments, issuerInfo, bundle });
          },
        });
      }

      async function registerNetworkInterfaces(networkVat, bridgeMgr) {
        const ps = [];
        // Every vat has a loopback device.
        ps.push(
          E(networkVat).registerInterfaceHandler(
            '/local',
            makeLoopbackInterfaceHandler(),
          ),
        );
        if (bridgeMgr) {
          // We have access to the bridge, and therefore IBC.
          // FIXME: Current hack.
          ps.push(
            E(networkVat).registerInterfaceHandler(
              '/ibc',
              makeLoopbackInterfaceHandler(),
            ),
          );
          /*
          // TODO: Add our IBC implementation!
          ps.push(
            E(networkVat).registerInterfaceHandler(
              '/ibc',
              makeIBCInterfaceHandler(bridgeMgr),
            ),
          );
          */
        }
        await Promise.all(ps);

        if (bridgeMgr) {
          // Add an echo listener to our /ibc network.
          const port = await E(networkVat).bind('/ibc/*/ordered/echo');
          E(port).addListener(
            harden({
              async onAccept(_port, _localAddr, _remoteAddr, _listenHandler) {
                return harden(makeEchoConnectionHandler());
              },
            }),
          );
        }
      }

      // objects that live in the client's solo vat. Some services should only
      // be in the DApp environment (or only in end-user), but we're not yet
      // making a distinction, so the user also gets them.
      async function createLocalBundle(vats, userBundle, payments, issuerInfo) {
        const { zoe, registry } = userBundle;
        // This will eventually be a vat spawning service. Only needed by dev
        // environments.
        const spawner = E(vats.host).makeHost();

        // Needed for DApps, maybe for user clients.
        const uploads = E(vats.uploads).getUploads();

        // Wallet for both end-user client and dapp dev client
        await E(vats.wallet).startup(zoe, registry);
        const wallet = E(vats.wallet).getWallet();
        await Promise.all(
          issuerInfo.map(({ petname, issuer, brandRegKey }) =>
            E(wallet).addIssuer(petname, issuer, brandRegKey),
          ),
        );

        // Make empty purses. Have some petnames for them.
        const pursePetnames = {
          moola: 'Fun budget',
          simolean: 'Nest egg',
        };
        await Promise.all(
          issuerInfo.map(({ petname: issuerPetname }) => {
            let pursePetname = pursePetnames[issuerPetname];
            if (!pursePetname) {
              pursePetname = `${issuerPetname} purse`;
              pursePetnames[issuerPetname] = pursePetname;
            }
            return E(wallet).makeEmptyPurse(issuerPetname, pursePetname);
          }),
        );

        // deposit payments
        const [moolaPayment, simoleanPayment] = await Promise.all(payments);

        await E(wallet).deposit(pursePetnames.moola, moolaPayment);
        await E(wallet).deposit(pursePetnames.simolean, simoleanPayment);

        // This will allow dApp developers to register in their api/deploy.js
        const httpRegCallback = {
          send(obj, connectionHandles) {
            return E(vats.http).send(obj, connectionHandles);
          },
          registerAPIHandler(handler) {
            return E(vats.http).registerURLHandler(handler, '/api');
          },
        };

        return allComparable(
          harden({
            uploads,
            spawner,
            wallet,
            network: vats.network,
            http: httpRegCallback,
          }),
        );
      }

      return harden({
        async bootstrap(argv, vats, devices) {
          const bridgeManager =
            devices.bridge && makeBridgeManager(E, D, devices.bridge);
          const [ROLE, bootAddress, additionalAddresses] = parseArgs(argv);

          async function addRemote(addr) {
            const { transmitter, setReceiver } = await E(vats.vattp).addRemote(
              addr,
            );
            await E(vats.comms).addRemote(addr, transmitter, setReceiver);
          }

          D(devices.mailbox).registerInboundHandler(vats.vattp);
          await E(vats.vattp).registerMailboxDevice(devices.mailbox);
          if (bootAddress) {
            await Promise.all(
              [bootAddress, ...additionalAddresses].map(addr =>
                addRemote(addr),
              ),
            );
          }

          console.debug(`${ROLE} bootstrap starting`);
          // scenario #1: Cloud has: multi-node chain, controller solo node,
          // provisioning server (python). New clients run provisioning
          // client (python) on localhost, which creates client solo node on
          // localhost, with HTML frontend. Multi-player mode.
          switch (ROLE) {
            case 'chain':
            case 'one_chain': {
              await registerNetworkInterfaces(vats.network, bridgeManager);

              // provisioning vat can ask the demo server for bundles, and can
              // register client pubkeys with comms
              await E(vats.provisioning).register(
                await makeChainBundler(vats, devices.timer),
                vats.comms,
                vats.vattp,
              );

              // accept provisioning requests from the controller
              const provisioner = harden({
                pleaseProvision(nickname, pubkey) {
                  console.debug('Provisioning', nickname, pubkey);
                  return E(vats.provisioning).pleaseProvision(
                    nickname,
                    pubkey,
                    PROVISIONER_INDEX,
                  );
                },
              });
              // bootAddress holds the pubkey of controller
              await E(vats.comms).addEgress(
                bootAddress,
                KEY_REG_INDEX,
                provisioner,
              );
              break;
            }
            case 'controller':
            case 'one_controller': {
              if (!GCI) {
                throw new Error(`controller must be given GCI`);
              }

              await registerNetworkInterfaces(vats.network, bridgeManager);

              // Wire up the http server.
              await setupCommandDevice(vats.http, devices.command, {
                controller: true,
              });
              // Create a presence for the on-chain provisioner.
              await addRemote(GCI);
              const chainProvisioner = await E(vats.comms).addIngress(
                GCI,
                KEY_REG_INDEX,
              );
              // Allow web requests from the provisioning server to call our
              // provisioner object.
              const provisioner = harden({
                pleaseProvision(nickname, pubkey) {
                  return E(chainProvisioner).pleaseProvision(nickname, pubkey);
                },
              });
              await E(vats.http).setProvisioner(provisioner);
              break;
            }
            case 'client':
            case 'one_client': {
              if (!GCI) {
                throw new Error(`client must be given GCI`);
              }
              await registerNetworkInterfaces(vats.network, bridgeManager);
              await setupCommandDevice(vats.http, devices.command, {
                client: true,
              });
              const localTimerService = await E(vats.timer).createTimerService(
                devices.timer,
              );
              await addRemote(GCI);
              // addEgress(..., index, ...) is called in vat-provisioning.
              const demoProvider = await E(vats.comms).addIngress(
                GCI,
                PROVISIONER_INDEX,
              );
              const { payments, bundle, issuerInfo } = await E(
                demoProvider,
              ).getDemoBundle();
              const localBundle = await createLocalBundle(
                vats,
                bundle,
                payments,
                issuerInfo,
              );
              await E(vats.http).setPresences(
                { ...bundle, localTimerService },
                localBundle,
              );
              await setupWalletVat(localBundle.http, vats.http, vats.wallet);
              break;
            }
            case 'two_chain': {
              // scenario #2: one-node chain running on localhost, solo node on
              // localhost, HTML frontend on localhost. Single-player mode.
              await registerNetworkInterfaces(vats.network, bridgeManager);

              // bootAddress holds the pubkey of localclient
              const chainBundler = await makeChainBundler(vats, devices.timer);
              const demoProvider = harden({
                // build a chain-side bundle for a client.
                async getDemoBundle(nickname) {
                  return chainBundler.createUserBundle(nickname);
                },
              });
              await Promise.all(
                [bootAddress, ...additionalAddresses].map(addr =>
                  E(vats.comms).addEgress(
                    addr,
                    PROVISIONER_INDEX,
                    demoProvider,
                  ),
                ),
              );
              break;
            }
            case 'two_client': {
              if (!GCI) {
                throw new Error(`client must be given GCI`);
              }
              await registerNetworkInterfaces(vats.network, bridgeManager);
              await setupCommandDevice(vats.http, devices.command, {
                client: true,
              });
              const localTimerService = await E(vats.timer).createTimerService(
                devices.timer,
              );
              await addRemote(GCI);
              // addEgress(..., PROVISIONER_INDEX) is called in case two_chain
              const demoProvider = E(vats.comms).addIngress(
                GCI,
                PROVISIONER_INDEX,
              );
              // Get the demo bundle from the chain-side provider
              const b = await E(demoProvider).getDemoBundle('client');
              const { payments, bundle, issuerInfo } = b;
              const localBundle = await createLocalBundle(
                vats,
                bundle,
                payments,
                issuerInfo,
              );
              await E(vats.http).setPresences(
                { ...bundle, localTimerService },
                localBundle,
              );
              await setupWalletVat(localBundle.http, vats.http, vats.wallet);
              break;
            }
            case 'three_client': {
              // scenario #3: no chain. solo node on localhost with HTML
              // frontend. Limited subset of demo runs inside the solo node.

              // We pretend we're on-chain.
              await registerNetworkInterfaces(vats.network, bridgeManager);

              // Shared Setup (virtual chain side) ///////////////////////////
              await setupCommandDevice(vats.http, devices.command, {
                client: true,
              });
              const { payments, bundle, issuerInfo } = await E(
                makeChainBundler(vats, devices.timer),
              ).createUserBundle('localuser');

              // Setup of the Local part /////////////////////////////////////
              const localBundle = await createLocalBundle(
                vats,
                bundle,
                payments,
                issuerInfo,
              );
              await E(vats.http).setPresences(
                { ...bundle, localTimerService: bundle.chainTimerService },
                localBundle,
              );

              setupWalletVat(localBundle.http, vats.http, vats.wallet);
              break;
            }
            default:
              throw new Error(`ROLE was not recognized: ${ROLE}`);
          }

          console.debug(`all vats initialized for ${ROLE}`);
        },
      });
    },
    helpers.vatID,
  );
}
