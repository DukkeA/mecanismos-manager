import { NextRequest, NextResponse } from "next/server";
import {
  deviceStationCode,
  pairStationDevice,
} from "@/server/attendance-service";
import { DomainError } from "@/domain/errors";
const cookieName = "mt-attendance-display";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await deviceStationCode(request.cookies.get(cookieName)?.value ?? ""),
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "No se pudo consultar el código.",
      },
      { status: error instanceof DomainError ? 401 : 500, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403, headers },
    );
  try {
    const { token } = await request.json();
    const credential = await pairStationDevice(token);
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(cookieName, credential, {
      httpOnly: true,
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      path: "/api/attendance-station",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "El enlace de vinculación no es válido.",
      },
      { status: 400, headers },
    );
  }
}
