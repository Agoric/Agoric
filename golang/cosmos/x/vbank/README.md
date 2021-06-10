# Virtual Bank

This module manages the integration between the Cosmos x/bank module and the VM.

"Bank purses" connect Cosmos-level bank module accounts with Agoric-level ERTP
purses and payments. A "bank purse" is created at the ERTP level which be
observed and manipulated as other purses, but modifications to it are sent over
the bridge to act upon the bank account. Updates to the bank account balance are
sent over the bridge to update the bank purse, whose balance can be queried
entirely at the ERTP level.

## State

The Vbank module maintains no significant state, but will access stored state through the bank module.

## Protocol

Purse operations which change the balance result in a downcall to this module to update the underlying account. A downcall is also made to query the account balance.

Upon an `EndBlock()` call, the module will scan the block for all `MsgSend` and `MsgMultiSend` events (see `cosmos-sdk/x/bank/spec/04_events.md`) and perform a `VBANK_BALANCE_UPDATE` upcall for all denominations held in all mentioned accounts.

The following fields are common to the Vbank messages:
- `"address"`, `"recipient"`, `"sender"`: account address as a bech32-encoded string
- `"amount"`: either amount to transfer or account balance, as an integer string
- `"denom"`: denomination as a string
- `"nonce"`: unique integer, as a number
- `"type"`: string of the type of message (enumerated below)
- `"updated"`: list of objects with the fields `"address"`, `"denom"`, `"amount"`.

Downcalls from JS to Cosmos (by `type`):
- `VBANK_GET_BALANCE (type, address, denom)`: gets the account balance in the given denomination from the bank. Returns the amount as a string.
- `VBANK_GRAB (type, sender, denom, amount)`: burns amount of denomination from account balance to reflect withdrawal from virtual purse. Returns a `VBANK_BALANCE_UPDATE` message restricted to the sender account and denomination.
- `VBANK_GIVE (type, recipeient, denom, amount)`: adds amount of denomination to account balance to reflect a deposit to the virtual purse. Returns a `VBANK_BALANCE_UPDATE` message restricted to the recipient account and denomination.

Upcalls from Cosmos to JS: (by `type`)
- `VBANK_BALANCE_UPDATE (type, nonce, updated)`: inform virtual purse of change to the account balance (including a change initiated by VBANK_GRAB or VBANK_GIVE).

## Testing

Test the following transfer scenarios:
- Purse-to-bank-purse
- bank-purse-to-purse
- bank-purse-to-bank-purse

The initial BLD and RUN purses are bank purses, but newly-created purses will
not be bank purses by default.
