"use client";
import { signOut } from "@/app/actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assertConnected } from "./query";
export function useSignOut() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ["session", "logout"],
    mutationFn: async () => {
      assertConnected();
      await signOut();
    },
    onSuccess: () => {
      client.clear();
      window.location.assign("/login");
    },
  });
}
