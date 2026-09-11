import { describe, it, expect } from "vitest";
import { parseSort, sortSnapshot } from "./table-sort";
import { emptyOperations } from "./operations-view";
describe("server table ordering", () => {
  it("rejects unknown columns, SQL fragments and unsupported directions", () => {
    for (const q of [
      "table=customers&orderBy=password",
      "table=customers&orderBy=name;DROP TABLE",
      "table=items&orderBy=name&direction=sideways",
    ])
      expect(() => parseSort(new URLSearchParams(q))).toThrow();
  });
  it("orders money numerically with deterministic ties and leaves source untouched", () => {
    const snapshot = {
      orders: [],
      locations: [],
      operations: {
        ...emptyOperations,
        accounts: [
          { id: "b", name: "B", balance: "20" },
          { id: "c", name: "C", balance: "3" },
          { id: "a", name: "A", balance: "20" },
        ],
      },
    };
    expect(
      sortSnapshot(snapshot, {
        table: "accounts",
        field: "balance",
        direction: "asc",
      }).operations.accounts.map((a) => a.id),
    ).toEqual(["c", "a", "b"]);
    expect(
      sortSnapshot(snapshot, {
        table: "accounts",
        field: "balance",
        direction: "desc",
      }).operations.accounts.map((a) => a.id),
    ).toEqual(["a", "b", "c"]);
    expect(snapshot.operations.accounts[0].id).toBe("b");
  });
  it("sorts available stock after reservations, not quantity alone", () => {
    const snapshot = {
      orders: [],
      locations: [],
      operations: {
        ...emptyOperations,
        balances: [
          {
            itemId: "a",
            locationId: "1",
            condition: "NEW",
            quantity: "20",
            reserved: "19",
            materialCost: "100",
          },
          {
            itemId: "b",
            locationId: "1",
            condition: "NEW",
            quantity: "5",
            reserved: "0",
            materialCost: "100",
          },
        ],
      },
    };
    expect(
      sortSnapshot(snapshot, {
        table: "balances",
        field: "available",
        direction: "asc",
      }).operations.balances[0].itemId,
    ).toBe("a");
  });
  it("keeps missing dates last in both directions", () => {
    const tasks = [
      { id: "a", title: "No date", status: "TODO", orderId: null, members: [] },
      {
        id: "b",
        title: "Dated",
        status: "TODO",
        orderId: null,
        members: [],
        dueAt: "2026-09-10",
      },
    ];
    for (const direction of ["asc", "desc"] as const)
      expect(
        sortSnapshot(
          {
            orders: [],
            locations: [],
            operations: { ...emptyOperations, tasks },
          },
          { table: "tasks", field: "dueAt", direction },
        ).operations.tasks[0].id,
      ).toBe("b");
  });
});
