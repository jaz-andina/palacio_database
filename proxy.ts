import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isLoginPage = path === '/login'

  const cookie = req.cookies.get('session')?.value
  const session = await decrypt(cookie)

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/transactions', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
