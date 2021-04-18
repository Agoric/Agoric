// eslint-disable-next-line spaced-comment
/// <reference path="extra-types.d.ts" />

/**
 * @typedef { "undefined" | "null" |
 *   "boolean" | "number" | "bigint" | "string" | "symbol" |
 *   "copyArray" | "copyRecord" | "copyError" | "remotable" | "promise"
 * } PassStyle
 *
 * TODO: We need to add a binary blob type to the PassStyles above and the
 * LeafData below, consisting of an uninterpreted sequence of octets (8 bit
 * bytes). The ideal JS representation would be a hardened `Uint8Array` except
 * that Uint8Arrays cannot be frozen. Instead the likely JS representation
 * will be a hardened ArrayBuffer.
 */

/**
 * @typedef { void | null | boolean | number | bigint | string | symbol
 * } LeafData
 * Corresponding PassStyle values are
 * "undefined", "null", "boolean", "number", "bigint", "string", "symbol".
 * A LeafData is a PassableKey and can be compared for equivalence with
 * `sameKey`.
 * LeafData can be sorted according to a yet-to-be-defined full order over all
 * LeafData.
 *    * We inherit JS's peculiar co-existence of two bottom values,
 *      `null` and `undefined`.
 *    * Following JS, `number` is an IEEE double precision floating point
 *      value which may be `NaN`, `Infinity`, or `-Infinity`.
 *    * There is only one NaN. A binary encoding therefore needs to
 *      canonicalize the NaN. The one NaN compares equivalent to itself.
 *    * There is only one 0, the IEEE non-negative zero. Negative
 *      zero must be canonicalized to non-negative zero, which must alway
 *      decode as non-negative zero. The one zero compares as equivalent to
 *      itself.
 *    * strings include all Unicode strings representable in JSON or
 *      utf8, even if they contain unpaired UTF-16 surrogates.
 *    * The `symbol` category includes only symbols which can be recreated
 *      from string data. It therefore excludes JS unregistered symbols or
 *      lisp/scheme gensyms. From JS it currently includes only
 *      `Symbol.asyncIterator` (a so-called well-known symbol). From JS
 *      it can include at most the well known symbols and the registered
 *      symbols. (Because symbol registration names can collide with
 *      well known symbol names, we will need another hilbert hotel
 *      encoding to allow well known symbols and all registered symbols.)
 *      From lisp, it can include symbols made from interned strings.
 */

/**
 * @typedef {*} PrimaryRemotable
 * An object marked with `Far` consisting of methods that can be remotely
 * invoked. A PrimaryRemotable has a fresh unforgeable identity, i.e.,
 * an unforgeable identity created when the object was created.
 *
 * A PrimaryRemotable, being a kind of Remotable, is pass-by-remote. When a
 * PrimaryRemotable T is passed as an argument in a message to an object in
 * another vat, it arrives as a Remote<T>.
 */

/**
 * @template {PrimaryRemotable} T
 * @typedef {*} Remote
 * A `Remote<T>` is a Remotable object in one vat that represents a
 * PrimaryRemotable of type T in another vat. The Remote has an unforgeable
 * identity that is one-to-one with the unforgeable identity of its primary.
 * If there is only one comm system between the two vats, then the identity of
 * the Remote is not observably different than the identity of its primary.
 *
 * A Remote, being a kind of Remotable, is pass-by-remote. When a Remote<T>
 * is passed as an argument in a message to an object in another vat, it
 * arrives as either a T or a Remote<T>, depending on whether the destination
 * is the home vat of its primary.
 */

/**
 * @template {PrimaryRemotable} T
 * @typedef {T | Remote<T>} Remotable
 * Corresponding PassStyle is "remotable"
 *
 * A Remotable<T> is either the PrimaryRemotable T in its home vat, or is one
 * of its Remote<T> representatives in other vats. The primary together with
 * all of its remotes are, in aggregate, the Unum<T>, the abstact distributed
 * object consisting of all these individual remotables. If there is only one
 * coherent comm system among the vats in question, then the unum as a whole
 * effectively has the unforgeable identity of its primary, since the identity
 * of each of its remotables is not observably different than the identity of
 * its primary.
 *
 * A Remotable is a PassableKey, which `sameKey` compares for euivalence
 * according to its unforgeable identity, which effectively compares the
 * unforgeable identities of their primaries.
 *
 * Remotables are unordered and cannot be sorted.
 *
 * A message eventually sent to a Remotable<T> is eventually delivered to
 * its primary T in the home vat of the primary.
 *
 * A remotable is pass-by-remote. When a (primary or remote) remotable is
 * passed as an argument in a message to an object in another vat, it arrives
 * as a (primary or remote) remotable for the same primary.
 *
 * A Remotable can be a key in a WeakStore, i.e., it can be a key in
 * a WeakMemoryMap or a WeakVirtualMap, or an element of a WeakMemorySet or
 * a WeakVirtualSet. Note that there are no passable weak stores, since it
 * doesn't make sense to pass something that cannot be enumerated.
 */

/**
 * @typedef {Remotable | Promise} LeafCap
 * The Corresponding PassStyles are "remotable" or "promise".
 *
 * Both remotables and promises may appear as the capability leaves of
 * a tree of pass-by-copy data. Ideally, a passed promise should only be a
 * promise for a passable, but we cannot know that at the time the promise is
 * passed, so we cannot enforce that.
 *
 * Promises are not PassableKeys or Comparables, and so cannot be compared for
 * equivalence. Promises are unordered and cannot be sorted.
 *
 * Promises have a lifecycle consisting of the following states
 *   * Unresolved - no decision yet about what the promise designates.
 *   * Resolved - decision made for this specific promise.
 *      * Forwarded - delegate eventual designation to another promise.
 *      * Settled - designation question permanently settled.
 *         * Rejected - will never designate anything for this *reason*.
 *         * Fulfilled - designates this non-thenable *fulfillment*.
 *
 * For local promises, this taxonomy applies without qualification. When
 * promise p is forwareded to promise q, then when q fulfills to f, p
 * is immediately identically fulfilled to f.
 *
 * A remote promise r can be modeled as a promise r in one vat that has been
 * forwarded to a promise q in another vat. Once q is settled, given eventual
 * connectivity and continued progress, r will eventually be settled. If
 * q is rejected, r will eventually be rejected, either with the same reason
 * or with a reason from the "system". If q is fulfulled, then r will
 * eventually either be fulfilled with the result of passing the fulfullment
 * (as if as an argument in a message), or r will be rejected with a reason
 * from the "system". For example, if q's fulfillment is not passable, then
 * r will be rejected with this non-passability as the reason. If q's
 * fulfullment is a PrimaryRemotable T, then r must eventually fulfill to
 * a Remote<T> with the same primary.
 *
 * If a promise is forwarded into a forwarding loop back to itself, whether
 * local or distributed, all the promises in that loop must eventually be
 * rejected.
 *
 * An eventual message sent to a promise that eventually fulfills must
 * eventually be delivered to its fulfillment.
 */

/**
 * @template {Passable} T
 * @typedef {T[]} CopyArray
 * Corresponding PassStyle is "copyArray".
 *
 * The semantics of CopyArrays are modeled on Tuples from the Records and
 * Tuples proposal. A CopyArray consists only of the sequence of its elements.
 *
 * CopyArray and CopyRecord are parameterized over various "deep" constraints
 * explained below. For example, iff all the elements of a CopyArray are
 * PassableKeys, then the CopyArray is a PassableKey that can be compared for
 * equivalence with `sameKey`. Two such CopyArrays are equivalent if their
 * elements are pairwise equivalent.
 *
 * A CopyArray as a JS object is a hardened plain array with no holes, no extra
 * properties, the normal non-enumerable `length` property, and enumerable
 * data properties from 0 to length-1.
 */

/**
 * @template {Passable} T
 * @typedef {{name: string]: T}} CopyRecord
 * Corresponding PassStyle is "copyRecord".
 *
 * The semantics of CopyRecords is modeled on Records from the Records and
 * Tuples proposal.
 * Property names can only be strings. A CopyRecord consists only of
 * a set of (property-name, value) pairs, where each property name
 * can appear at most once. It is therefore a single-valued mapping
 * from property-name to value. CopyRecords enumerate their properties
 * according to the sort order of their property names.
 *
 * CopyArray and CopyRecord are parameterized over various "deep" constraints
 * explained below. For example, iff the values of a CopyRecord are
 * PassableKeys, the CopyRecord is PassableKeys and can be compared for
 * equivalence based on the pairwise equivalence of their values.
 * Iff the values of a CopyRecord are sortable, then the CopyRecord is
 * sortable. Two sortable CopyRecords with the same property names are
 * compared by lexicographic comparison ordered by the sorted order of
 * their property names.
 */

/**
 * @typedef {Object} CopyError
 * Corresponding PassStyle is "copyError".
 *
 * TODO What I'd like to say in these types in that only a CopyError
 * without an `errorId` field is a Comparable.
 *
 * ***TODO WARNING*** Since CopyErrors have no analog amount Records and
 * Tuples, perhaps a CopyError in general should only be a Comparable but
 * not a PassableKey. Or perhaps not even a Comparable! In that case we
 * wouldn't need to make a special case for `errorId`.
 * @property {string} name
 * @property {string} message
 * @property {string=} errorId
 */

/**
 * @template {Passable} T
 * @typedef { LeafData | CopyArray<T> | CopyRecord<T> | CopyError
 * } NestedData
 * Corresponding PassStyle values are
 * the PassStyles of LeafData, "copyArray", "copyRecord", "copyError"
 *
 * NestedData is parameterized over various "deep" constraints. See
 * the discussion in CopyArray and CopyRecord above.
 */

/**
 * @typedef {NestedData<PureData>} PureData
 * Contains no capabilities (promises, remotables)
 * Contains no sets or maps
 * Contains no proxies, or anything which can sense being examined.
 * Cannot be tested for, but only assured by construction
 * pureCopy(OnlyData) => PureData
 */

/**
 * @typedef {PureData | NestedData<OnlyData>} OnlyData
 * Tested by `isOnlyData`, `assertOnlyData`
 * Contains no capabilities (promises, remotables)
 * Contains no sets or maps
 * The objects it contains may contain proxies, and therefore
 * may cause side effects when examined.
 */

/**
 * @typedef {Remotable | OnlyData | NestedData<PassableKey> } PassableKey
 *
 * PassableKeys can be compared for equivalence with `sameKey`. A
 * PassableKey can be used as a key in a StrongStore, i.e., used
 * as a key in a CopyMap, MemoryMap, or VirtualMap, and used as
 * an element of a CopySet, MemorySet, or VirtualSet.
 *
 * Note that a PassableKey cannot contain promises nor passable
 * stores.
 *
 * Passing should preserve `sameKey` equivalence. Given that PassableKeys
 * `Xa` and `Ya` in vat A, when passed to vat B, arrive as `Xb` and `Yb`, then
 * `sameKey(Xa, Ya)` in vat A must have the same answer as `sameKey(Xb, Yb)`
 * in vat B.
 */

/**
 * @template {PassableKey} K
 * @typedef {*} CopyStore
 * @property {(key: K) => boolean} has
 * @property {() => K[]} keys
 *
 * A CopyStore may contain PassableKeys that cannot be sorted, so
 * the distributed object semantics itself does not specify a deterministic
 * enumeration order for passable stores. However, a given programming
 * language should specify a deterministic enumeration order. For JS
 * this would likely be based on insertion order.
 *
 * CopyStores are not themselves
 * PassableKeys and so cannot be compared with `sameKey` nor serve as
 * indexes in other passable stores. However, they are Comparable and
 * so may still be compared for equivalence with `sameStructure`. Two
 * CopyStores that are equivalent by `sameStructure` may have
 * different enumeration orders according to the more specific language
 * binding semantics.
 */

/**
 * @template {PassableKey} K
 * @typedef {CopyStore<K>} CopySet
 */

/**
 * @template {PassableKey} K
 * @template {Passable} V
 * @typedef {CopyStore<K>} CopyMap
 * @property {(key: K) => V} get
 * @property {() => V[]} values
 * @property {() => [K,V][]} entries
 */

/**
 * @template T
 * @typedef { PassableKey | CopySet<T> | CopyMap<T,T> } NestedComparable
 */

/**
 * @typedef { NestedComparable<Comparable>} Comparable
 */

/**
 * @typedef {Promise | NestedComparable<Passable>} Passable
 * A Passable value that may be marshalled. It is classified as one of
 * PassStyle. A Passable must be hardened.
 *
 * A Passable has a pass-by-copy superstructure. This includes the atomic
 * pass-by-copy primitives ("bigint" | "boolean" | "null" | "number" |
 * "string" | "undefined") and the composite pass-by-copy objects ("copyArray" |
 * "copyRecord" | "copyError"). The composite pass-by-copy objects that may
 * contain other Passables.
 *
 * A Passable's pass-by-copy superstructure ends in LeafData and LeafCaps. The
 * Passable can be further classified by the nature of the LeafCaps. Since a
 * Passable is hardened, its structure and classification is stable --- its
 * structure and classification cannot change even if some of the objects are
 * proxies.
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @template Slot
 * @callback ConvertValToSlot
 * @param {PassableCap} val
 * @returns {Slot}
 */

/**
 * @template Slot
 * @callback ConvertSlotToVal
 * @param {Slot} slot
 * @param {InterfaceSpec=} iface
 * @returns {PassableCap}
 */

/**
 * @template T
 * @typedef {{ '@qclass': T }} EncodingClass
 */

/**
 * @typedef {EncodingClass<'NaN'> |
 * EncodingClass<'undefined'> |
 * EncodingClass<'Infinity'> |
 * EncodingClass<'-Infinity'> |
 * EncodingClass<'bigint'> & { digits: string } |
 * EncodingClass<'@@asyncIterator'> |
 * EncodingClass<'error'> & { name: string, message: string, errorId?: string } |
 * EncodingClass<'slot'> & { index: number, iface?: InterfaceSpec } |
 * EncodingClass<'hilbert'> & { original: Encoding, rest?: Encoding }} EncodingUnion
 * @typedef {{ [index: string]: Encoding, '@qclass'?: undefined }} EncodingRecord
 * We exclude '@qclass' as a property in encoding records.
 * @typedef {EncodingUnion | null | string | boolean | number | EncodingRecord} EncodingElement
 */

/**
 * @typedef {EncodingElement | NestedArray<EncodingElement>} Encoding
 * The JSON structure that the data portion of a Passable serializes to.
 *
 * The QCLASS 'hilbert' is a reference to the Hilbert Hotel
 * of https://www.ias.edu/ideas/2016/pires-hilbert-hotel
 * If QCLASS appears as a property name in the data, we encode it instead
 * as a QCLASS record of type 'hilbert'. To do so, we must move the other
 * parts of the record into fields of the hilbert record.
 */

/**
 * @template Slot
 * @typedef CapData
 * @property {string} body A JSON.stringify of an Encoding
 * @property {Slot[]} slots
 */

/**
 * @template Slot
 * @callback Serialize
 * @param {Passable} val
 * @returns {CapData<Slot>}
 */

/**
 * @template Slot
 * @callback Unserialize
 * @param {CapData<Slot>} data
 * @returns {Passable}
 */

/**
 * @template Slot
 * @typedef Marshal
 * @property {Serialize<Slot>} serialize
 * @property {Unserialize<Slot>} unserialize
 */

/**
 * @template Slot
 * @callback MakeMarshal
 * @param {ConvertValToSlot=} convertValToSlot
 * @param {ConvertSlotToVal=} convertSlotToVal
 * @param {MakeMarshalOptions=} options
 * @returns {Marshal}
 */

/**
 * @typedef MakeMarshalOptions
 * @property {'on'|'off'=} errorTagging controls whether serialized errors
 * also carry tagging information, made from `marshalName` and numbers
 * generated (currently by counting) starting at `errorIdNum`. The
 * `errorTagging` option defaults to `'on'`. Serialized
 * errors are also logged to `marshalSaveError` only if tagging is `'on'`.
 * @property {string=} marshalName Used to identify sent errors.
 * @property {number=} errorIdNum Ascending numbers staring from here
 * identify the sending of errors relative to this marshal instance.
 * @property {(err: Error) => void=} marshalSaveError If `errorTagging` is
 * `'on'`, then errors serialized by this marshal instance are also
 * logged by calling `marshalSaveError` *after* `assert.note` associated
 * that error with its errorId. Thus, if `marshalSaveError` in turn logs
 * to the normal console, which is the default, then the console will
 * show that note showing the associated errorId.
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {string} InterfaceSpec
 * This is an interface specification.
 * For now, it is just a string, but will eventually be any OnlyData. Either
 * way, it must remain pure, so that it can be safely shared by subgraphs that
 * are not supposed to be able to communicate.
 */

/**
 * @callback MarshalGetInterfaceOf
 * Simple semantics, just tell what interface (or undefined) a remotable has.
 *
 * @param {*} maybeRemotable the value to check
 * @returns {InterfaceSpec|undefined} the interface specification, or undefined
 * if not a deemed to be a Remotable
 */
