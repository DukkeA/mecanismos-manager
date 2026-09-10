import { NextResponse } from "next/server";
import { supabaseServer } from "@/server/auth";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) return Response.json({error: "Configuración pendiente."}, {status: 503});
  if (code) {
    const auth = await supabaseServer();
    const {error} = await auth.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", origin));
  }
  return NextResponse.redirect(new URL("/login?error=oauth", origin));
}
