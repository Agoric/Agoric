// @ts-check

// import '@agoric/marshal/src/types.js';

/**
 * @typedef {CapData<string>} SwingSetCapData
 */

/**
 * @typedef {{ moduleFormat: unknown }} Bundle
 *
 * @typedef {{
 *   bundle: Bundle,
 *   enableSetup: false,
 * }} HasBundle
 * @typedef {{
 *   setup: unknown,
 *   enableSetup: true,
 * }} HasSetup
 *
 * TODO: liveSlotsConsole...
 * See validateManagerOptions() in factory.js
 *
 * @typedef { 'local' | 'nodeWorker' | 'node-subprocess' | 'xs-worker' | 'xs-worker-no-gc' } ManagerType
 * @typedef {{
 *   consensusMode: boolean,
 *   enablePipelining?: boolean,
 *   managerType: ManagerType,
 *   gcEveryCrank?: boolean,
 *   metered?: boolean,
 *   enableDisavow?: boolean,
 *   useTranscript?: boolean,
 *   enableVatstore?: boolean,
 *   vatParameters: Record<string, unknown>,
 *   virtualObjectCacheSize: number,
 *   name: string,
 *   compareSyscalls?: (originalSyscall: {}, newSyscall: {}) => Error | undefined,
 *   vatConsole: Console,
 *   liveSlotsConsole?: Console,
 * } & (HasBundle | HasSetup)} ManagerOptions
 */

/**
 * See ../docs/static-vats.md#vatpowers
 *
 * @typedef { MarshallingVatPowers & TerminationVatPowers } VatPowers
 *
 * @typedef { (VatPowers & MeteringVatPowers) } StaticVatPowers
 *
 * @typedef {{
 *   Remotable: unknown,
 *   getInterfaceOf: unknown,
 * }} MarshallingVatPowers
 *
 * @typedef {{
 *   makeGetMeter: unknown,
 *   transformMetering: unknown,
 * }} MeteringVatPowers
 *
 * @typedef {{
 *   exitVat: unknown,
 *   exitVatWithFailure: unknown,
 * }} TerminationVatPowers
 */

/*
 * `['message', targetSlot, msg]`
 * msg is `{ method, args, result }`
 * `['notify', resolutions]`
 * `['dropExports', vrefs]`
 */

/**
 * @typedef {{
 * method: string,
 * args: SwingSetCapData,
 * result?: string,
 * }} Message
 *
 * @typedef { 'sendOnly' | 'ignore' | 'logAlways' | 'logFailure' | 'panic' } ResolutionPolicy
 *
 * @typedef { [tag: 'message', target: string, msg: Message]} VatDeliveryMessage
 * @typedef { [tag: 'notify', resolutions: string[] ]} VatDeliveryNotify
 * @typedef { [tag: 'dropExports', vrefs: string[] ]} VatDeliveryDropExports
 * @typedef { [tag: 'retireExports', vrefs: string[] ]} VatDeliveryRetireExports
 * @typedef { [tag: 'retireImports', vrefs: string[] ]} VatDeliveryRetireImports
 * @typedef { VatDeliveryMessage | VatDeliveryNotify | VatDeliveryDropExports
 *            | VatDeliveryRetireExports | VatDeliveryRetireImports
 *          } VatDeliveryObject
 * @typedef { [tag: 'ok', message: null, usage: unknown] | [tag: 'error', message: string, usage: unknown | null] } VatDeliveryResult
 *
 * @typedef { [tag: 'send', target: string, msg: Message] } VatSyscallSend
 * @typedef { [tag: 'callNow', target: string, method: string, args: SwingSetCapData]} VatSyscallCallNow
 * @typedef { [tag: 'subscribe', vpid: string ]} VatSyscallSubscribe
 * @typedef { [ vpid: string, rejected: boolean, data: SwingSetCapData ]} VatResolutions
 * @typedef { [tag: 'resolve', resolutions: VatResolutions ]} VatSyscallResolve
 * @typedef { [tag: 'vatstoreGet', key: string ]} VatSyscallVatstoreGet
 * @typedef { [tag: 'vatstoreSet', key: string, data: string ]} VatSyscallVatstoreSet
 * @typedef { [tag: 'vatstoreDelete', key: string ]} VatSyscallVatstoreDelete
 * @typedef { [tag: 'dropImports', slots: string[] ]} VatSyscallDropImports
 * @typedef { [tag: 'retireImports', slots: string[] ]} VatSyscallRetireImports
 * @typedef { [tag: 'retireExports', slots: string[] ]} VatSyscallRetireExports
 *
 * @typedef { VatSyscallSend | VatSyscallCallNow | VatSyscallSubscribe
 *    | VatSyscallResolve | VatSyscallVatstoreGet | VatSyscallVatstoreSet
 *    | VatSyscallVatstoreDelete | VatSyscallDropImports
 *    | VatSyscallRetireImports | VatSyscallRetireExports
 * } VatSyscallObject
 *
 * @typedef { [tag: 'ok', data: SwingSetCapData | string | null ]} VatSyscallResultOk
 * @typedef { [tag: 'error', err: string ] } VatSyscallResultError
 * @typedef { VatSyscallResultOk | VatSyscallResultError } VatSyscallResult
 * @typedef { (vso: VatSyscallObject) => VatSyscallResult } VatSyscaller
 *
 * @typedef { [tag: 'message', target: string, msg: Message]} KernelDeliveryMessage
 * @typedef { [tag: 'notify', resolutions: string[] ]} KernelDeliveryNotify
 * @typedef { [tag: 'dropExports', krefs: string[] ]} KernelDeliveryDropExports
 * @typedef { [tag: 'retireExports', krefs: string[] ]} KernelDeliveryRetireExports
 * @typedef { [tag: 'retireImports', krefs: string[] ]} KernelDeliveryRetireImports
 * @typedef { KernelDeliveryMessage | KernelDeliveryNotify | KernelDeliveryDropExports
 *            | KernelDeliveryRetireExports | KernelDeliveryRetireImports
 *          } KernelDeliveryObject
 * @typedef { [tag: 'send', target: string, msg: Message] } KernelSyscallSend
 * @typedef { [tag: 'callNow', target: string, method: string, args: SwingSetCapData]} KernelSyscallCallNow
 * @typedef { [tag: 'subscribe', kpid: string ]} KernelSyscallSubscribe
 * @typedef { [ kpid: string, rejected: boolean, data: SwingSetCapData ]} KernelResolutions
 * @typedef { [tag: 'resolve', resolutions: KernelResolutions ]} KernelSyscallResolve
 * @typedef { [tag: 'vatstoreGet', key: string ]} KernelSyscallVatstoreGet
 * @typedef { [tag: 'vatstoreSet', key: string, data: string ]} KernelSyscallVatstoreSet
 * @typedef { [tag: 'vatstoreDelete', key: string ]} KernelSyscallVatstoreDelete
 * @typedef { [tag: 'dropImports', krefs: string[] ]} KernelSyscallDropImports
 * @typedef { [tag: 'retireImports', krefs: string[] ]} KernelSyscallRetireImports
 * @typedef { [tag: 'retireExports', krefs: string[] ]} KernelSyscallRetireExports
 *
 * @typedef { KernelSyscallSend | KernelSyscallCallNow | KernelSyscallSubscribe
 *    | KernelSyscallResolve | KernelSyscallVatstoreGet | KernelSyscallVatstoreSet
 *    | KernelSyscallVatstoreDelete | KernelSyscallDropImports
 *    | KernelSyscallRetireImports | KernelSyscallRetireExports
 * } KernelSyscallObject
 * @typedef { [tag: 'ok', data: SwingSetCapData | string | null ]} KernelSyscallResultOk
 * @typedef { [tag: 'error', err: string ] } KernelSyscallResultError
 * @typedef { KernelSyscallResultOk | KernelSyscallResultError } KernelSyscallResult
 *
 * @typedef { { d: VatDeliveryObject, syscalls: VatSyscallObject[] } } TranscriptEntry
 * @typedef { { transcriptCount: number } } VatStats
 * @typedef { ReturnType<typeof import('./kernel/state/vatKeeper').makeVatKeeper> } VatKeeper
 * @typedef { ReturnType<typeof import('./kernel/state/kernelKeeper').default> } KernelKeeper
 * @typedef { ReturnType<typeof import('@agoric/xsnap').xsnap> } XSnap
 * @typedef { (dr: VatDeliveryResult) => void } SlogFinishDelivery
 * @typedef { (ksr: KernelSyscallResult, vsr: VatSyscallResult) => void } SlogFinishSyscall
 * @typedef { { write: ({}) => void,
 *              delivery: (vatID: string,
 *                         newCrankNum: Number, newDeliveryNum: Number,
 *                         kd: KernelDeliveryObject, vd: VatDeliveryObject,
 *                         replay?: boolean) => SlogFinishDelivery,
 *              syscall: (vatID: string,
 *                        ksc: KernelSyscallObject | undefined,
 *                        vsc: VatSyscallObject) => SlogFinishSyscall,
 *             } } KernelSlog
 *
 * @typedef { { createFromBundle: (vatID: string,
 *                                 bundle: Bundle,
 *                                 managerOptions: ManagerOptions,
 *                                 vatSyscallHandler: unknown) => Promise<VatManager>,
 *            } } VatManagerFactory
 * @typedef { { deliver: (delivery: VatDeliveryObject) => Promise<VatDeliveryResult>,
 *              replayTranscript: (startPos: StreamPosition | undefined) => Promise<number?>,
 *              makeSnapshot?: (ss: SnapStore) => Promise<string>,
 *              shutdown: () => Promise<void>,
 *            } } VatManager
 * @typedef { ReturnType<typeof import('@agoric/xsnap').makeSnapStore> } SnapStore
 * @typedef { () => Promise<void> } WaitUntilQuiescent
 */

/**
 * @typedef {{
 *   sourceSpec: string // path to pre-bundled root
 * }} SourceSpec
 * @typedef {{
 *   bundleSpec: string // path to bundled code
 * }} BundleSpec
 * @typedef {{
 *   bundle: Bundle
 * }} BundleRef
 * @typedef {(SourceSpec | BundleSpec | BundleRef ) & {
 *   creationOptions?: Record<string, any>,
 *   parameters?: Record<string, any>,
 * }} SwingSetConfigProperties
 */

/**
 * @typedef {Record<string, SwingSetConfigProperties>} SwingSetConfigDescriptor
 * Where the property name is the name of the vat.  Note that
 * the `bootstrap` property names the vat that should be used as the bootstrap vat.  Although a swingset
 * configuration can designate any vat as its bootstrap vat, `loadBasedir` will always look for a file named
 * 'bootstrap.js' and use that (note that if there is no 'bootstrap.js', there will be no bootstrap vat).
 */

/**
 * @typedef {Object} SwingSetConfig a swingset config object
 * @property {string} [bootstrap]
 * @property { ManagerType } [defaultManagerType]
 * @property {SwingSetConfigDescriptor} [vats]
 * @property {SwingSetConfigDescriptor} [bundles]
 * @property {*} [devices]
 *
 * Swingsets defined by scanning a directory in this manner define no devices.
 */

/**
 * @typedef {{ bundleName: string} | { bundle: Bundle }} SourceOfBundle
 */
/**
 * @typedef { import('@agoric/swing-store-simple').KVStore } KVStore
 * @typedef { import('@agoric/swing-store-simple').StreamStore } StreamStore
 * @typedef { import('@agoric/swing-store-simple').StreamPosition } StreamPosition
 * @typedef { import('@agoric/swing-store-simple').SwingStore } SwingStore
 *
 * @typedef {{
 *   kvStore: KVStore,
 *   streamStore: StreamStore,
 *   snapStore?: SnapStore,
 * }} HostStore
 *
 * @typedef { ReturnType<typeof import('./kernel/state/storageWrapper').addHelpers> } KVStorePlus
 */
