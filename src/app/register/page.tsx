'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const supabase = createClient()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    if (error) {
      toast.error(error.message)
    } else {
      if (token) {
        await supabase.rpc('accept_invitation', { p_token: token })
      }
      toast.success('Registracija uspješna! Provjeri email za potvrdu.')
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-forest-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">LD Kuna Osekovo</h1>
          <p className="text-forest-300 mt-1">{token ? 'Prihvati pozivnicu' : 'Registracija'}</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Novi račun</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ime i prezime</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-500" placeholder="Ivan Horvat" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-500" placeholder="tvoj@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lozinka</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forest-500" placeholder="min. 6 znakova" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50">
              {loading ? 'Registracija...' : 'Registriraj se'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            Već imaš račun?{' '}
            <Link href="/login" className="text-forest-600 font-medium hover:underline">Prijavi se</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
