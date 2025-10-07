import './globals.css'
import Link from 'next/link'
import WalletButton from '../components/WalletButton'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>ScriptVault — Encrypted Script Registry</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <nav className="border-b border-white/10 bg-primary/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <Link href="/" className="text-xl font-bold text-white font-serif">ScriptVault</Link>
                <p className="text-xs text-gray-400">Encrypted Script Registry</p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link className="text-gray-200 hover:text-white" href="/">Create</Link>
              <Link className="text-gray-200 hover:text-white" href="/works">Works</Link>
              <Link className="text-gray-200 hover:text-white" href="/licenses">Licenses</Link>
              <WalletButton />
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
