// @ts-check

import { assert, details as X } from '@agoric/assert';
import { Nat } from '@agoric/nat';
import { natSafeMath } from './safeMath';

const { subtract, add, multiply, floorDivide } = natSafeMath;

const BASIS_POINTS = 10000n; // TODO change to 10_000n once tooling copes.

/**
 * Calculations for constant product markets like Uniswap.
 * https://github.com/runtimeverification/verified-smart-contracts/blob/uniswap/uniswap/x-y-k.pdf
 */

/**
 * Contains the logic for calculating how much should be given
 * back to the user in exchange for what they sent in. Reused in
 * several different places, including to check whether an offer
 * is valid, getting the current price for an asset on user
 * request, and to do the actual reallocation after an offer has
 * been made.
 *
 * @param {NatValue} inputValue - the value of the asset sent
 * in to be swapped
 * @param {NatValue} inputReserve - the value in the liquidity
 * pool of the kind of asset sent in
 * @param {NatValue} outputReserve - the value in the liquidity
 * pool of the kind of asset to be sent out
 * @param {bigint} [feeBasisPoints=30n] - the fee taken in
 * basis points. The default is 0.3% or 30 basis points. The fee
 * is taken from inputValue
 * @returns {NatValue} outputValue - the current price, in value form
 */
export const getInputPrice = (
  inputValue,
  inputReserve,
  outputReserve,
  feeBasisPoints = 30n,
) => {
  Nat(inputValue);
  Nat(inputReserve);
  Nat(outputReserve);
  assert(inputValue > 0n, X`inputValue ${inputValue} must be positive`);
  assert(inputReserve > 0n, X`inputReserve ${inputReserve} must be positive`);
  assert(
    outputReserve > 0n,
    X`outputReserve ${outputReserve} must be positive`,
  );

  const oneMinusFeeScaled = subtract(BASIS_POINTS, feeBasisPoints);
  const inputWithFee = multiply(inputValue, oneMinusFeeScaled);
  const numerator = multiply(inputWithFee, outputReserve);
  const denominator = add(multiply(inputReserve, BASIS_POINTS), inputWithFee);
  return floorDivide(numerator, denominator);
};

/**
 * Contains the logic for calculating how much should be taken
 * from the user in exchange for what they want to obtain. Reused in
 * several different places, including to check whether an offer
 * is valid, getting the current price for an asset on user
 * request, and to do the actual reallocation after an offer has
 * been made.
 *
 * @param {NatValue} outputValue - the value of the asset the user wants
 * to get
 * @param {NatValue} inputReserve - the value in the liquidity
 * pool of the asset being spent
 * @param {NatValue} outputReserve - the value in the liquidity
 * pool of the kind of asset to be sent out
 * @param {bigint} [feeBasisPoints=30n] - the fee taken in
 * basis points. The default is 0.3% or 30 basis points. The fee is taken from
 * outputValue
 * @returns {NatValue} inputValue - the value of input required to purchase output
 */
export const getOutputPrice = (
  outputValue,
  inputReserve,
  outputReserve,
  feeBasisPoints = 30n,
) => {
  Nat(outputValue);
  Nat(inputReserve);
  Nat(outputReserve);
  assert(inputReserve > 0n, X`inputReserve ${inputReserve} must be positive`);
  assert(
    outputReserve > 0n,
    X`outputReserve ${outputReserve} must be positive`,
  );
  assert(
    outputReserve > outputValue,
    X`outputReserve ${outputReserve} must be greater than outputValue ${outputValue}`,
  );

  const oneMinusFeeScaled = subtract(BASIS_POINTS, feeBasisPoints);
  const numerator = multiply(multiply(outputValue, inputReserve), BASIS_POINTS);
  const denominator = multiply(
    subtract(outputReserve, outputValue),
    oneMinusFeeScaled,
  );
  return add(floorDivide(numerator, denominator), 1n);
};

// Calculate how many liquidity tokens we should be minting to send back to the
// user when adding liquidity. We provide new liquidity equal to the existing
// liquidity multiplied by the ratio of new central tokens to central tokens
// already held. If the current supply is zero, return the inputValue as the
// initial liquidity to mint is arbitrary.
export const calcLiqValueToMint = (
  liqTokenSupply,
  inputValue,
  inputReserve,
) => {
  Nat(liqTokenSupply);
  Nat(inputValue);
  Nat(inputReserve);

  if (liqTokenSupply === 0n) {
    return inputValue;
  }
  return floorDivide(multiply(inputValue, liqTokenSupply), inputReserve);
};

/**
 * Calculate how much of the secondary token is required from the user when
 * adding liquidity. We require that the deposited ratio of central to secondary
 * match the current ratio of holdings in the pool.
 *
 * @param {NatValue} centralIn - The value of central assets being deposited
 * @param {NatValue} centralPool - The value of central assets in the pool
 * @param {NatValue} secondaryPool - The value of secondary assets in the pool
 * @param {NatValue} secondaryIn - The value of secondary assets provided. If
 * the pool is empty, the entire amount will be accepted
 * @returns {NatValue} - the amount of secondary required
 */
export const calcSecondaryRequired = (
  centralIn,
  centralPool,
  secondaryPool,
  secondaryIn,
) => {
  if (centralPool === 0n || secondaryPool === 0n) {
    return secondaryIn;
  }

  const scaledSecondary = floorDivide(
    multiply(centralIn, secondaryPool),
    centralPool,
  );
  const exact =
    multiply(centralIn, secondaryPool) ===
    multiply(scaledSecondary, centralPool);

  // doesn't match the x-y-k.pdf paper, but more correct. When the ratios are
  // exactly equal, lPrime is exactly l * (1 + alpha) and adding one is wrong
  return exact ? scaledSecondary : 1n + scaledSecondary;
};

// Calculate how many underlying tokens (in the form of a value) should be
// returned when removing liquidity.
export const calcValueToRemove = (
  liqTokenSupply,
  poolValue,
  liquidityValueIn,
) => {
  Nat(liqTokenSupply);
  Nat(liquidityValueIn);
  Nat(poolValue);

  return floorDivide(multiply(liquidityValueIn, poolValue), liqTokenSupply);
};
