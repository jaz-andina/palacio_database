'use server'
import { redirect } from 'next/navigation'
import { createSession, deleteSession } from '@/lib/session'

export async function login(prevState: string | null, formData: FormData) {
  const username = formData.get('username') as string
  const password = formData.get('password') as string

  if (
    username !== process.env.AUTH_USERNAME ||
    password !== process.env.AUTH_PASSWORD
  ) {
    return 'Invalid username or password'
  }

  await createSession()
  redirect('/transactions')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
