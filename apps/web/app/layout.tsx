import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { SmoothScrollProvider } from '@/components/providers/smooth-scroll-provider';
import { Navbar } from '@/components/layout/Navbar';
import './globals.css';

// Sustituto vía next/font/google de la tipografía display objetivo (Neue Machina /
// General Sans, no disponibles como Google Font): swap directo cuando se licencien.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', weight: ['700'] });
const inter = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'ORACLE ODDS — Data-Driven Certainty',
  description:
    'Análisis predictivo deportivo con probabilidades propias y justificación estadística. Herramienta informativa, no una casa de apuestas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="bg-background font-body text-foreground antialiased">
        <Navbar />
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
