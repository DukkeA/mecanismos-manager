import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { db } from "./db";
import { AccessDenied } from "@/domain/permissions";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Falta configurar Supabase Auth.");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        } catch {
          /* Server Components cannot write cookies; proxy refreshes them. */
        }
      },
    },
  });
}

// Distinguishes a valid identity without workshop access from a missing session.
export class MembershipRequired extends AccessDenied {}

export async function requireMember() {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email || !user.email_confirmed_at)
    throw new AccessDenied();
  // The verified provider identity is bound to a pre-authorized member exactly once.
  // Mutable profile metadata never determines application permissions.
  return db().$transaction(async (tx) => {
    let member = await tx.member.findUnique({
      where: { authSubject: user.id },
    });
    if (!member) {
      await tx.member.updateMany({
        where: {
          email: user.email!.toLowerCase(),
          authSubject: null,
          active: true,
        },
        data: { authSubject: user.id },
      });
      member = await tx.member.findUnique({ where: { authSubject: user.id } });
    }
    if (!member?.active) throw new MembershipRequired();
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      avatarUrl: googleAvatarUrl(user),
    };
  });
}

// Provider profile data is only used for display; permissions come from Member.
function googleAvatarUrl(user: User): string | undefined {
  const profile = user.identities?.find(
    (identity) => identity.provider === "google",
  )?.identity_data;
  const picture = profile?.avatar_url ?? profile?.picture;
  if (typeof picture !== "string") return undefined;
  try {
    const url = new URL(picture);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com"))
    )
      return url.href;
  } catch {
    /* Missing or invalid photos use the member's initials. */
  }
  return undefined;
}
