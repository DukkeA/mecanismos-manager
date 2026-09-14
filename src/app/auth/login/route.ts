import { NextResponse } from "next/server";
import { supabaseServer } from "@/server/auth";

export async function POST(request: Request) {
  if (process.env.GOOGLE_AUTH_ENABLED !== "true")
    return Response.json(
      { error: "Google está pendiente de configuración." },
      { status: 503 },
    );
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || request.headers.get("origin") !== new URL(origin).origin)
    return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: { prompt: "select_account" },
      redirectTo: new URL("/auth/callback", origin).toString(),
    },
  });
  if (error || !data.url)
    return NextResponse.redirect(new URL("/login?error=oauth", origin), 303);
  return NextResponse.redirect(data.url, 303);
}
