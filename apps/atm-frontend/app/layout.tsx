import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zegen ATM + XFS Simulator',
  description: 'Virtual ATM with XFS device emulation layer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
