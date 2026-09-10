import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db } from "./db";
import { AccessDenied } from "@/domain/permissions";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Falta configurar Supabase Auth.");
  const jar = await cookies();
  return createServerClient(url, key, {cookies: {
    getAll: () => jar.getAll(),
    setAll: (values) => {
      try { for (const {name,value,options} of values) jar.set(name,value,options); }
      catch { /* Server Components cannot write cookies; proxy refreshes them. */ }
    },
  }});
}

export async function requireMember() {
  const supabase = await supabaseServer();
  const {data: {user}, error} = await supabase.auth.getUser();
  if (error || !user || !user.email || !user.email_confirmed_at) throw new AccessDenied();
  // The verified provider identity is bound to a pre-authorized member exactly once.
  // Mutable profile metadata never determines application permissions.
  return db().$transaction(async (tx) => {
    let member = await tx.member.findUnique({where: {authSubject: user.id}});
    if (!member) {
      await tx.member.updateMany({
        where: {email: user.email!.toLowerCase(), authSubject: null, active: true},
        data: {authSubject: user.id},
      });
      member = await tx.member.findUnique({where: {authSubject: user.id}});
    }
    if (!member?.active) throw new AccessDenied();
    return {id: member.id, name: member.name, role: member.role};
  });
}
