import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    'https://dlcehyicarwwbjkluofl.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsY2VoeWljYXJ3d2Jqa2x1b2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDE0NjAsImV4cCI6MjA5MDQ3NzQ2MH0.HhlPHRjUm6bski9GLrCXZkm0Dw7LF8kfPjJbw68WrFg'
  )
}
