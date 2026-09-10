"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
export const useTeam = () =>
  useWorkshopQuery((data) => data.operations.members);
export const useTeamMutation = () => useOperationMutation("team");
