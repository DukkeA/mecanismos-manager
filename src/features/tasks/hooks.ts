"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
export const useTasks = (archived = false) =>
  useWorkshopQuery((data) =>
    archived ? (data.operations.archivedTasks ?? []) : data.operations.tasks,
  );
export const useTaskMutation = () => useOperationMutation("tasks");
