'use client';
import { useRouter } from 'next/navigation';
import { BatchReview } from '@/components/batch/Review';
import { RequireSignIn } from '@/components/RequireSignIn';

export default function ReviewPage() {
  const router = useRouter();
  return <RequireSignIn><BatchReview onCamera={() => router.push('/scan')} /></RequireSignIn>;
}
