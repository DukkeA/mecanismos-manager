"use server";
import { requireMember } from "@/server/auth";
import { readNotification } from "@/server/activity-query";
export async function markNotificationsRead(input: unknown) {
  await readNotification(await requireMember(), input);
}
