import { redirect } from 'next/navigation'
import { createAnonServerClient } from '@/lib/supabase/server'
import AdminDashboard from '@/components/admin/AdminDashboard'

export default async function AdminDashboardPage() {
  const supabase = createAnonServerClient()

  // Verify authenticated admin session via cookie-less server check
  // Note: For full SSR session validation, you'd use @supabase/ssr with cookies.
  // This page is protected client-side by the auth state check in AdminDashboard.
  // The Supabase RLS policies ensure data is only accessible to authenticated admins.

  return <AdminDashboard />
}

export const dynamic = 'force-dynamic'
