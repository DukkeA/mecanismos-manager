import { NextResponse } from "next/server";
import {
  MembershipRequired,
  requireMember,
  supabaseServer,
} from "@/server/auth";
import { AccessDenied } from "@/domain/permissions";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin)
    return Response.json(
      { error: "Configuración pendiente." },
      { status: 503 },
    );
  if (!code)
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  try {
    const auth = await supabaseServer();
    const { error } = await auth.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(new URL("/login?error=oauth", origin));
    try {
      await requireMember();
    } catch (error) {
      if (error instanceof MembershipRequired) {
        // End only the session that just attempted to access this workshop.
        await auth.auth.signOut({ scope: "local" });
        return NextResponse.redirect(new URL("/login?error=access", origin));
      }
      if (error instanceof AccessDenied)
        return NextResponse.redirect(new URL("/login?error=oauth", origin));
      throw error;
    }
    return NextResponse.redirect(new URL("/", origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=unavailable", origin));
  }
}
