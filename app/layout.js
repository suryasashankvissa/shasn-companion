import { Oswald, Inter } from 'next/font/google';
import './globals.css';

const display = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'Campaign Companion — for Shasn',
  description: 'A digital campaign deck companion for your Shasn board game nights.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d1220',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="backdrop" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
