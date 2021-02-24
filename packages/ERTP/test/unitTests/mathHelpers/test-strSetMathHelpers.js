import test from 'ava';
import { Far, Data } from '@agoric/marshal';
import { makeAmountMath, MathKind } from '../../../src';

// The "unit tests" for MathHelpers actually make the calls through
// AmountMath so that we can test that any duplication is handled
// correctly.

const mockBrand = Far('brand', {
  isMyIssuer: () => false,
  getAllegedName: () => 'mock',
});

const amountMath = makeAmountMath(mockBrand, 'strSet');

test('strSetMathHelpers', t => {
  const {
    getBrand,
    getAmountMathKind,
    make,
    coerce,
    getValue,
    getEmpty,
    isEmpty,
    isGTE,
    isEqual,
    add,
    subtract,
  } = amountMath;

  // getBrand
  t.deepEqual(getBrand(), mockBrand, 'brand is brand');

  // getAmountMathKind
  t.deepEqual(
    getAmountMathKind(),
    MathKind.STRING_SET,
    'amountMathKind is strSet',
  );

  // make
  t.notThrows(() => make(harden(['1'])), `['1'] is a valid string array`);
  t.throws(
    () => make(4),
    { message: /value must be an array/ },
    `4 is not a valid string array`,
  );
  t.throws(
    () => make(harden([6])),
    { message: /must be a string/ },
    `[6] is not a valid string array`,
  );
  t.throws(
    () => make('abc'),
    { message: /value must be an array/ },
    `'abc' is not a valid string array`,
  );
  t.throws(
    () => make(harden(['a', 'a'])),
    { message: /value has duplicates/ },
    `duplicates in make throw`,
  );

  // coerce
  t.deepEqual(
    coerce(Data({ brand: mockBrand, value: ['1'] })),
    Data({ brand: mockBrand, value: ['1'] }),
    `coerce({ brand, value: ['1']}) is a valid amount`,
  );
  t.throws(
    () => coerce(Data({ brand: mockBrand, value: [6] })),
    { message: /must be a string/ },
    `[6] is not a valid string array`,
  );
  t.throws(
    () => coerce(Data({ brand: mockBrand, value: '6' })),
    { message: /value must be an array/ },
    `'6' is not a valid array`,
  );
  t.throws(
    () => coerce(Data({ brand: mockBrand, value: ['a', 'a'] })),
    { message: /value has duplicates/ },
    `duplicates should throw`,
  );

  // getValue
  t.deepEqual(getValue(Data({ brand: mockBrand, value: ['1'] })), ['1']);
  t.deepEqual(getValue(make(harden(['1']))), ['1']);

  // getEmpty
  t.deepEqual(
    getEmpty(),
    Data({ brand: mockBrand, value: [] }),
    `empty is []`,
  );

  t.assert(
    isEmpty(Data({ brand: mockBrand, value: [] })),
    `isEmpty([]) is true`,
  );
  t.falsy(
    isEmpty(Data({ brand: mockBrand, value: ['abc'] })),
    `isEmpty(['abc']) is false`,
  );
  t.throws(
    () => isEmpty(Data({ brand: mockBrand, value: ['a', 'a'] })),
    { message: /value has duplicates/ },
    `duplicates in isEmpty throw because coerce throws`,
  );

  // isGTE
  t.throws(
    () =>
      isGTE(
        Data({ brand: mockBrand, value: ['a', 'a'] }),
        Data({ brand: mockBrand, value: ['b'] }),
      ),
    null,
    `duplicates in the left of isGTE should throw`,
  );
  t.throws(
    () =>
      isGTE(
        Data({ brand: mockBrand, value: ['a'] }),
        Data({ brand: mockBrand, value: ['b', 'b'] }),
      ),
    null,
    `duplicates in the right of isGTE should throw`,
  );
  t.assert(
    isGTE(
      Data({ brand: mockBrand, value: ['a'] }),
      Data({ brand: mockBrand, value: ['a'] }),
    ),
    `overlap between left and right of isGTE should not throw`,
  );
  t.assert(
    isGTE(
      Data({ brand: mockBrand, value: ['a', 'b'] }),
      Data({ brand: mockBrand, value: ['a'] }),
    ),
    `['a', 'b'] is gte to ['a']`,
  );
  t.falsy(
    isGTE(
      Data({ brand: mockBrand, value: ['a'] }),
      Data({ brand: mockBrand, value: ['b'] }),
    ),
    `['a'] is not gte to ['b']`,
  );

  // isEqual
  t.throws(
    () =>
      isEqual(
        Data({ brand: mockBrand, value: ['a', 'a'] }),
        Data({ brand: mockBrand, value: ['a'] }),
      ),
    { message: /value has duplicates/ },
    `duplicates in left of isEqual should throw`,
  );
  t.throws(
    () =>
      isEqual(
        Data({ brand: mockBrand, value: ['a'] }),
        Data({ brand: mockBrand, value: ['a', 'a'] }),
      ),
    { message: /value has duplicates/ },
    `duplicates in right of isEqual should throw`,
  );
  t.assert(
    isEqual(
      Data({ brand: mockBrand, value: ['a'] }),
      Data({ brand: mockBrand, value: ['a'] }),
    ),
    `overlap between left and right of isEqual is ok`,
  );
  t.assert(
    isEqual(
      Data({ brand: mockBrand, value: ['a', 'b'] }),
      Data({ brand: mockBrand, value: ['b', 'a'] }),
    ),
    `['a', 'b'] equals ['b', 'a']`,
  );
  t.falsy(
    isEqual(
      Data({ brand: mockBrand, value: ['a'] }),
      Data({ brand: mockBrand, value: ['b'] }),
    ),
    `['a'] does not equal ['b']`,
  );

  // add
  t.throws(
    () =>
      add(
        Data({ brand: mockBrand, value: ['a', 'a'] }),
        Data({ brand: mockBrand, value: ['b'] }),
      ),
    { message: /value has duplicates/ },
    `duplicates in left of add should throw`,
  );
  t.throws(
    () =>
      add(
        Data({ brand: mockBrand, value: ['a'] }),
        Data({ brand: mockBrand, value: ['b', 'b'] }),
      ),
    { message: /value has duplicates/ },
    `duplicates in right of add should throw`,
  );
  t.throws(
    () =>
      add(
        Data({ brand: mockBrand, value: ['a'] }),
        Data({ brand: mockBrand, value: ['a'] }),
      ),
    { message: /left and right have same element/ },
    `overlap between left and right of add should throw`,
  );
  t.deepEqual(
    add(
      Data({ brand: mockBrand, value: ['a'] }),
      Data({ brand: mockBrand, value: ['b'] }),
    ),
    Data({ brand: mockBrand, value: ['a', 'b'] }),
    `['a'] + ['b'] = ['a', 'b']`,
  );

  // subtract
  t.throws(
    () =>
      subtract(
        Data({ brand: mockBrand, value: ['a', 'a'] }),
        Data({ brand: mockBrand, value: ['b'] }),
      ),
    { message: /value has duplicates/ },
    `duplicates in left of subtract should throw`,
  );
  t.throws(
    () =>
      subtract(
        Data({ brand: mockBrand, value: ['a'] }),
        Data({ brand: mockBrand, value: ['b', 'b'] }),
      ),
    { message: /value has duplicates/ },
    `duplicates in right of subtract should throw`,
  );
  t.deepEqual(
    subtract(
      Data({ brand: mockBrand, value: ['a'] }),
      Data({ brand: mockBrand, value: ['a'] }),
    ),
    Data({ brand: mockBrand, value: [] }),
    `overlap between left and right of subtract should not throw`,
  );
  t.throws(
    () =>
      subtract(
        Data({ brand: mockBrand, value: ['a', 'b'] }),
        Data({ brand: mockBrand, value: ['c'] }),
      ),
    { message: /some of the elements in right .* were not present in left/ },
    `elements in right but not in left of subtract should throw`,
  );
  t.deepEqual(
    subtract(
      Data({ brand: mockBrand, value: ['a', 'b'] }),
      Data({ brand: mockBrand, value: ['a'] }),
    ),
    Data({ brand: mockBrand, value: ['b'] }),
    `['a', 'b'] - ['a'] = ['a']`,
  );
});
