"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
export const useTasks = () => useWorkshopQuery((data) => data.operations.tasks);
export const useTaskMutation = () => useOperationMutation("tasks");
