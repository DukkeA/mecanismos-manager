"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
export const useCash = () =>
  useWorkshopQuery((data) => ({
    coverage:data.operations.coverage??[],
    accounts: data.operations.accounts,
    obligations: data.operations.obligations,
    entries: data.operations.cashEntries,
  }));
export const useCashMutation = () => useOperationMutation("cash");
