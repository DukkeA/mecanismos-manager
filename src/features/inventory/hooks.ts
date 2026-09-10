"use client";
import { useOperationMutation, useWorkshopQuery } from "../workshop/query";
export const useInventory = () =>
  useWorkshopQuery((data) => ({
    items: data.operations.items,
    balances: data.operations.balances,
    offers: data.operations.offers,
    movements: data.operations.movements,
  }));
export const useInventoryMutation = () => useOperationMutation("inventory");
