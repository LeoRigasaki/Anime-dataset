import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const revalidate = 300

export async function GET() {
  const { data, error } = await supabase
    .from('dataset_versions')
    .select('activated_at, records_loaded, source_file')
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    updated_at: data?.activated_at ?? null,
    records: data?.records_loaded ?? null,
  })
}
