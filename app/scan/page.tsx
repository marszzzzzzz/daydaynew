'use client';
import { useRouter } from 'next/navigation';
import { BatchCamera } from '@/components/batch/Camera';
import { RequireSignIn } from '@/components/RequireSignIn';

export default function ScanPage() {
  const router = useRouter();
  return (
    <RequireSignIn>
      <BatchCamera onReview={() => router.push('/scan/review')} onClose={() => router.push('/contacts')} />
    </RequireSignIn>
  );
}
