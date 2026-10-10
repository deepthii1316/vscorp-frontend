import './globals.css';
import Sidebar from '@/components/Sidebar';
import AppShell from '@/components/AppShell';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';

export const metadata = {
  title: 'Virata Retail — Retail Operations',
  description: 'Upload and manage retail data reports for Virata Retail Reebok store.',
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the boot script sets data-theme on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
