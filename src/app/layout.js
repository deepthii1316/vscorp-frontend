import './globals.css';
import Sidebar from '@/components/Sidebar';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Virata Retail — Retail Operations',
  description: 'Upload and manage retail data reports for Virata Retail Reebok store.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
