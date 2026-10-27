import { NextResponse } from 'next/server';

// Existing accounts use ordinary sign-in, without a sign-up invitation ticket.
// This redirect never grants membership: workspace_members controls all access.
export function GET(request) {
  const url = new URL(request.url);
  const registered = url.searchParams.get('registered') === '1';
  const destination = new URL(registered ? '/login' : '/sign-up', url.origin);
  const ticket = url.searchParams.get('__clerk_ticket');
  if (!registered && ticket && ticket.length <= 16000) destination.searchParams.set('__clerk_ticket', ticket);
  destination.searchParams.set('returnTo', '/app');
  return NextResponse.redirect(destination);
}
