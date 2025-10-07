'use client'

import { useEffect, useState } from 'react'

export default function WalletButton() {
  const [addr, setAddr] = useState<string>("")

  useEffect(() => {
    const eth = (window as any).ethereum
    if (!eth) return
    const handler = (accounts: string[]) => {
      if (accounts && accounts[0]) setAddr(accounts[0])
      else setAddr("")
    }
    eth.request({ method: 'eth_accounts' }).then((accounts: string[]) => handler(accounts)).catch(()=>{})
    eth.on && eth.on('accountsChanged', handler)
    return () => { eth.removeListener && eth.removeListener('accountsChanged', handler) }
  }, [])

  const connect = async () => {
    const eth = (window as any).ethereum
    if (!eth) { alert('Please install MetaMask'); return }
    const accounts = await eth.request({ method: 'eth_requestAccounts' })
    if (accounts && accounts[0]) setAddr(accounts[0])
  }

  const short = (a: string) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : ''

  return (
    <button onClick={connect} className="btn-secondary">
      {addr ? short(addr) : 'Connect Wallet'}
    </button>
  )
}

