# DawnTrader Signal → Strategy → Pattern Mapping

> **Schema Version**: regime-mapping/v3.0.0
> **Last Updated**: 2026-04-12T00:00:00Z

## Strategy Registry

| Strategy Key | Display Name | Signal Type | Pattern Type | Primary Regime |
|--------------|--------------|-------------|--------------|----------------|
| vwap_pullback | VWAP Pullback | QUANT | — | TREND_FRIENDLY_STABLE |
| morning_star | Morning Star / Evening Star | PATTERN | MORNING_STAR | TREND_FRIENDLY_STABLE |
| pivot_shift | Pivot Shift | HYBRID | MORNING_STAR | TREND_FRIENDLY_STABLE |
| strong_bull_trend | Strong Bull Trend | QUANT | — | TREND_FRIENDLY_STABLE |
| mean_reversion | Mean Reversion | QUANT | — | HIGH_VOLATILITY_UNSTABLE |
| reverse_impulse | Reverse Impulse | HYBRID | PINBAR | HIGH_VOLATILITY_UNSTABLE |
| defensive_hedge | Defensive Hedge | HYBRID | ENGULFING | HIGH_VOLATILITY_UNSTABLE |
| inside_bar_reversal | Inside Bar Reversal | PATTERN | INSIDE_BAR | HIGH_VOLATILITY_UNSTABLE |
| range_trade | Range Trading | QUANT | — | RANGE_BOUND_STABLE |
| support_bounce | Support Bounce | PATTERN | PINBAR | RANGE_BOUND_STABLE |
| abcd_long | ABCD Long | QUANT | — | RANGE_BOUND_STABLE |
| adaptive_flow | Adaptive Flow | HYBRID | TRI_STAR | RANGE_BOUND_STABLE |
| sma_trend_ride | SMA Trend Ride | QUANT | — | IMPULSE_EXPANSION |
| breakout | Breakout | QUANT | — | IMPULSE_EXPANSION |
| vwap_bounce | VWAP Bounce | QUANT | — | IMPULSE_EXPANSION |
| volatility_edge | Volatility Edge | HYBRID | ABCD | IMPULSE_EXPANSION |
| dhma | DHMA | QUANT | — | IMPULSE_EXPANSION |
| liquidity_trap | Liquidity Trap | QUANT | — | STRUCTURAL_TRANSITION |
| orb | Opening Range Breakout | QUANT | — | TREND_FRIENDLY_STABLE |

## Changes in v1.4b

- **SMA Trend Ride**: Realigned from BULL_STABLE → HIGH_VOL_IMPULSE
- **Range Trade**: Confirmed in LOW_VOL_CHOP with updated metrics (Bandwidth < 0.14, RSI 45–55)
