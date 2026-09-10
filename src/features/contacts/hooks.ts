"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
export const useContacts = () =>
  useWorkshopQuery((data) => ({
    customers: data.operations.customers,
    suppliers: data.operations.suppliers,
  }));
export const useContactMutation = () => useOperationMutation("contacts");
