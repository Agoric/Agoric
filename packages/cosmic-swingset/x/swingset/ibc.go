package swingset

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"
	"github.com/cosmos/cosmos-sdk/x/capability"
	channel "github.com/cosmos/cosmos-sdk/x/ibc/04-channel"
	channelexported "github.com/cosmos/cosmos-sdk/x/ibc/04-channel/exported"
	channeltypes "github.com/cosmos/cosmos-sdk/x/ibc/04-channel/types"
	ibctypes "github.com/cosmos/cosmos-sdk/x/ibc/types"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/Agoric/agoric-sdk/packages/cosmic-swingset/x/swingset/internal/keeper"
)

// FIXME: How to tell the caller when this is a new channel?

type ChannelEndpoint struct {
	Port    string `json:"port"`
	Channel string `json:"channel"`
}

type ChannelTuple struct {
	Destination ChannelEndpoint `json:"dst"`
	Source      ChannelEndpoint `json:"src"`
}

type channelHandler struct {
}

type channelMessage struct { // comes from swingset's IBC handler
	Method string       `json:"method"`
	Tuple  ChannelTuple `json:"tuple"`
	Data64 string       `json:"data64"`
}

func (cm channelMessage) GetData() []byte {
	data, err := base64.StdEncoding.DecodeString(cm.Data64)
	if err != nil {
		fmt.Println("Could not decode base64 of", cm.Data64, ":", err)
		return nil
	}
	return data
}

func init() {
	RegisterPortHandler("dibc", NewIBCChannelHandler())
}

func NewIBCChannelHandler() channelHandler {
	return channelHandler{}
}

func (ch channelHandler) Receive(ctx *ControllerContext, str string) (ret string, err error) {
	fmt.Println("channel handler received", str)

	msg := new(channelMessage)
	err = json.Unmarshal([]byte(str), &msg)
	if err != nil {
		return "", err
	}

	switch msg.Method {
	case "ack":
		if ctx.CurrentPacket == nil {
			return "", fmt.Errorf("current packet is already acknowledged")
		}
		err = ctx.Keeper.PacketExecuted(ctx.Context, ctx.CurrentPacket, msg.GetData())
		ctx.CurrentPacket = nil
		if err != nil {
			return "", err
		}
		return "true", nil

	case "close":
		// Make sure our channel goes away.
		if err = ctx.Keeper.ChanCloseInit(ctx.Context, msg.Tuple.Destination.Port, msg.Tuple.Destination.Channel); err != nil {
			return "", err
		}
		return "true", nil

	case "send":
		seq, ok := ctx.Keeper.GetNextSequenceSend(
			ctx.Context,
			msg.Tuple.Destination.Port,
			msg.Tuple.Destination.Channel,
		)
		if !ok {
			return "", fmt.Errorf("unknown sequence number")
		}

		// TODO: Maybe allow specification?
		blockTimeout := int64(keeper.DefaultPacketTimeout)

		packet := channeltypes.NewPacket(
			msg.GetData(), seq,
			msg.Tuple.Source.Port, msg.Tuple.Source.Channel,
			msg.Tuple.Destination.Port, msg.Tuple.Destination.Channel,
			uint64(ctx.Context.BlockHeight()+blockTimeout),
		)
		if err := ctx.Keeper.SendPacket(ctx.Context, packet); err != nil {
			return "", err
		}
		return "true", nil

	default:
		return "", fmt.Errorf("unrecognized method %s", msg.Method)
	}
}

// Implement IBCModule callbacks
func (am AppModule) OnChanOpenInit(
	ctx sdk.Context,
	order channelexported.Order,
	connectionHops []string,
	portID string,
	channelID string,
	chanCap *capability.Capability,
	counterparty channeltypes.Counterparty,
	version string,
) error {
	// Claim channel capability passed back by IBC module
	if err := am.keeper.ClaimCapability(ctx, chanCap, ibctypes.ChannelCapabilityPath(portID, channelID)); err != nil {
		return sdkerrors.Wrap(channel.ErrChannelCapabilityNotFound, err.Error())
	}

	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_CHAN_OPEN_INIT"}`)
	return err
}

func (am AppModule) OnChanOpenTry(
	ctx sdk.Context,
	order channelexported.Order,
	connectionHops []string,
	portID,
	channelID string,
	chanCap *capability.Capability,
	counterparty channeltypes.Counterparty,
	version,
	counterpartyVersion string,
) error {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_CHAN_OPEN_TRY"}`)
	return err
}

func (am AppModule) OnChanOpenAck(
	ctx sdk.Context,
	portID,
	channelID string,
	counterpartyVersion string,
) error {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_CHAN_OPEN_ACK"}`)
	return err
}

func (am AppModule) OnChanOpenConfirm(
	ctx sdk.Context,
	portID,
	channelID string,
) error {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_CHAN_OPEN_CONFIRM"}`)
	// update these to all use the same type, but embed some data describing which case we're in, and include portID and channelID. type= IBC
	return err
}

func (am AppModule) OnChanCloseInit(
	ctx sdk.Context,
	portID,
	channelID string,
) error {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_CHAN_CLOSE_INIT"}`)
	return err
}

func (am AppModule) OnChanCloseConfirm(
	ctx sdk.Context,
	portID,
	channelID string,
) error {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_CHAN_CLOSE_CONFIRM"}`)
	return err
}

func (am AppModule) OnRecvPacket(
	ctx sdk.Context,
	packet channeltypes.Packet,
) (*sdk.Result, error) {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_RECV_PACKET"}`)
	return nil, err
}

func (am AppModule) OnAcknowledgementPacket(
	ctx sdk.Context,
	packet channeltypes.Packet,
	acknowledment []byte,
) (*sdk.Result, error) {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_ACK_PACKET"}`)
	return nil, err
}

func (am AppModule) OnTimeoutPacket(
	ctx sdk.Context,
	packet channeltypes.Packet,
) (*sdk.Result, error) {
	_, err := am.keeper.CallToController(`{"type":"FIXME_IBC_TIMEOUT_PACKET"}`)
	return nil, err
}
