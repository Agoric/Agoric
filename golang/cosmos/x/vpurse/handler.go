package vpurse

import (
	"fmt"

	"github.com/Agoric/agoric-sdk/golang/cosmos/x/swingset"

	sdk "github.com/cosmos/cosmos-sdk/types"
	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"
)

// NewHandler returns a handler for "vpurse" type messages.
func NewHandler(keeper Keeper) sdk.Handler {
	return func(ctx sdk.Context, msg sdk.Msg) (*sdk.Result, error) {
		if swingset.IsSimulation(ctx) {
			// We don't support simulation.
			return &sdk.Result{}, nil
		} else {
			// The simulation was done, so now allow infinite gas.
			ctx = ctx.WithGasMeter(sdk.NewInfiniteGasMeter())
		}

		switch msg := msg.(type) {
		default:
			errMsg := fmt.Sprintf("Unrecognized vpurse Msg type: %v", msg.Type())
			return nil, sdkerrors.Wrap(sdkerrors.ErrUnknownRequest, errMsg)
		}
	}
}
