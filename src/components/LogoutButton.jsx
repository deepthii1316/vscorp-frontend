'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const { signOut } = useAuth();
  const router = useRouter();

  const onClick = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="top-bar-icon-btn"
      title="Sign out"
      aria-label="Sign out"
    >
      <LogOut style={{ width: '15px', height: '15px' }} />
    </button>
  );
}
