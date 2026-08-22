import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Career Ops — Job Application Radar",
  description: "Automated job application tracker, email response radar, and webhook receiver",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[var(--color-bg)] text-[var(--color-fg)] min-h-screen antialiased selection:bg-[var(--color-accent)] selection:text-[#0b0c0f]">
        {children}
      </body>
    </html>
  )
}
