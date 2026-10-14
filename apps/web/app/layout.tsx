import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { AgeGate } from '@/components/compliance/AgeGate';
import { CookieConsent } from '@/components/compliance/CookieConsent';
import { ResponsibleGamingBanner } from '@/components/compliance/ResponsibleGamingBanner';
import { BetSlipDrawer } from '@/components/slip/BetSlipDrawer';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', weight: ['500', '700'], display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Comparador de cuotas y probabilidades`, template: `%s · ${SITE_NAME}` },
  description: 'Comparación informativa de cuotas de operadores autorizados y estimaciones estadísticas calibradas. Sin apuestas en la plataforma. Solo mayores de 18 años.',
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'es_CO' },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: '#0B0B0D', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-background font-body text-foreground antialiased">
        <ResponsibleGamingBanner />
        <Navbar />
        <main id="main" className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6">
          {children}
        </main>
        <Footer />
        <BetSlipDrawer />
        <AgeGate />
        <CookieConsent />
      </body>
    </html>
  );
}
