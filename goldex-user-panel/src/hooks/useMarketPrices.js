import { useEffect, useState } from 'react'
import { getMarketSocket } from '../services/socket'

// Subscribes to live price updates for the given pair keys (e.g. "gold-irr").
// Returns { prices, connected } where prices is keyed by pairKey and each value
// carries displayBuyPrice / displaySellPrice (the user-facing prices).
export function useMarketPrices(pairKeys) {
  const [prices, setPrices] = useState({})
  const [connected, setConnected] = useState(false)
  const keyStr = (pairKeys || []).join(',')

  useEffect(() => {
    if (!keyStr) return
    const pairs = keyStr.split(',')
    const socket = getMarketSocket()

    const subscribe = () => socket.emit('subscribe-prices', { pairs })
    const onConnect = () => { setConnected(true); subscribe() }
    const onDisconnect = () => setConnected(false)
    // payload is an object: { [pairKey]: priceDataPoint, ... }
    const onPriceUpdate = (payload) => setPrices((prev) => ({ ...prev, ...payload }))

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('price-update', onPriceUpdate)

    if (socket.connected) { setConnected(true); subscribe() }

    return () => {
      socket.emit('unsubscribe-prices', { pairs })
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('price-update', onPriceUpdate)
    }
  }, [keyStr])

  return { prices, connected }
}
