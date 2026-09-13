import assert from "node:assert/strict";
const base = process.env.TEST_APP_URL ?? "http://localhost:3100";
assert.ok(["http://localhost:3100", "http://localhost:3101"].includes(base));
for (const [role, name] of [
  ["admin", "Claudia Rojas"],
  ["office", "Paola Méndez"],
  ["mechanic", "Luis Cárdenas"],
]) {
  const response = await fetch(base + "/dev/access", {
    method: "POST",
    headers: {
      origin: base,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ role }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const home = await fetch(base + "/", { headers: { cookie } });
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.ok(html.includes(name));
  if (role === "mechanic") {
    assert.ok(!html.includes("Cuenta bancaria del taller"));
    assert.ok(!html.includes("Transportes San Jerónimo y Asociados"));
  }
  const categoryResponse = await fetch(base + "/api/categories", {
    headers: { cookie },
  });
  assert.equal(categoryResponse.status, 200);
  assert.match(categoryResponse.headers.get("cache-control"), /no-store/);
  assert.ok(
    (await categoryResponse.json()).some(
      (c) => c.name === "Bombas de inyección",
    ),
  );
  const createdCategory = await fetch(base + "/api/categories", {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "create",
      input: {
        requestId: crypto.randomUUID(),
        name: "BOMBAS DE INYECCION",
      },
    }),
  });
  assert.equal(createdCategory.status, role === "mechanic" ? 403 : 200);
  if (role !== "mechanic") {
    const selectedCategory = await createdCategory.json();
    assert.equal(selectedCategory.name, "Bombas de inyección");
    assert.equal(selectedCategory.created, false);
  }
  if (role !== "admin") {
    const denied = await fetch(base + "/api/categories", {
      method: "POST",
      headers: { cookie, origin: base, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "save",
        input: {
          requestId: crypto.randomUUID(),
          name: "Categoría no autorizada",
          active: true,
        },
      }),
    });
    assert.equal(denied.status, 403);
  }
  const snapshotResponse = await fetch(base + "/api/workshop", {
    headers: { cookie },
  });
  assert.equal(snapshotResponse.status, 200);
  assert.match(snapshotResponse.headers.get("cache-control"), /no-store/);
  const snapshot = await snapshotResponse.json();
  assert.ok(snapshot.actorId);
  assert.equal(
    snapshot.operations.obligations.some((o) => o.category === "PAYROLL"),
    role !== "mechanic",
  );
  if (role === "mechanic") {
    assert.equal(snapshot.operations.accounts.length, 0);
    assert.equal(snapshot.operations.cashEntries.length, 0);
    assert.ok(
      snapshot.operations.tasks.every((t) =>
        t.members.includes(snapshot.actorId),
      ),
    );
  }
  for (const [path, allowed] of [
    ["/api/commerce?resource=sales", role !== "mechanic"],
    ["/api/control?resource=purchases", role !== "mechanic"],
    ["/api/control?resource=margins", role === "admin"],
    ["/api/control?resource=audit", role === "admin"],
    ["/api/reports", role === "admin"],
    ["/api/reports?resource=products", role === "admin"],
    ["/api/activity?resource=latest", role !== "mechanic"],
    ["/api/activity?resource=notifications", role === "admin"],
    ["/api/attendance", true],
    ["/api/attendance?scope=team", role !== "mechanic"],
    ["/api/attendance?resource=settings", role === "admin"],
    ["/api/team?period=2026-09", role !== "mechanic"],
    ["/api/team?resource=overtime", role !== "mechanic"],
    ["/api/team?resource=leaves", role !== "mechanic"],
    ["/api/team?resource=advances", role !== "mechanic"],
    ["/api/team?resource=vacations", role !== "mechanic"],
    ["/api/team?resource=payroll&period=2026-09", role !== "mechanic"],
    [
      `/api/team?resource=history&memberId=${snapshot.actorId}`,
      role !== "mechanic",
    ],
    [
      "/api/records?table=members&orderBy=monthlySalary&direction=desc",
      role !== "mechanic",
    ],
    ["/api/records?table=members", role !== "mechanic"],
  ]) {
    const result = await fetch(base + path, { headers: { cookie } });
    assert.equal(result.status, allowed ? 200 : 403, `${role}: ${path}`);
  }
  if (role !== "mechanic") {
    const query = async (params) => {
      const result = await fetch(
        base + "/api/records?" + new URLSearchParams(params),
        { headers: { cookie } },
      );
      assert.equal(result.status, 200);
      return result.json();
    };
    const first = await query({
      table: "customers",
      size: "10",
      page: "1",
      orderBy: "name",
    });
    const second = await query({
      table: "customers",
      size: "10",
      page: "2",
      orderBy: "name",
    });
    assert.ok(first.total > 10);
    assert.equal(first.total, second.total);
    assert.ok(
      second.rows.every(
        (row) => !first.rows.some((previous) => previous.id === row.id),
      ),
    );
    const transfers = await query({
      table: "cashEntries",
      status: "TRANSFERS",
      size: "50",
    });
    assert.ok(transfers.total > 0);
    assert.ok(transfers.rows.every((row) => Boolean(row.transferId)));
    const obligations = await query({ table: "obligations", size: "50" });
    assert.equal(
      obligations.rows.some((row) => row.category === "PAYROLL"),
      true,
    );
  }
  console.log(`Acceso ${role}: permisos y consultas correctos.`);
}
const rejected = await fetch(base + "/dev/access", {
  method: "POST",
  headers: {
    origin: "https://otro.example",
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "role=admin",
  redirect: "manual",
});
assert.equal(rejected.status, 403);
console.log("Solicitud desde otro origen rechazada.");

assert.equal((await fetch(base + "/api/workshop")).status, 401);

for (const path of [
  "/api/activity?resource=latest",
  "/api/attendance",
  "/api/categories",
  "/api/team?period=2026-09",
  "/api/records?table=customers",
  "/api/control?resource=purchases",
  "/api/commerce?resource=sales",
]) {
  assert.equal((await fetch(base + path)).status, 401, path);
}
assert.equal(
  (
    await fetch(
      base +
        "/api/attachments?entityType=ORDER&entityId=00000000-0000-4000-a000-000000000000",
    )
  ).status,
  404,
);
console.log("Peticiones sin acceso rechazadas.");

assert.equal((await fetch(base + "/api/attendance-station")).status, 401);
assert.equal(
  (
    await fetch(base + "/api/attendance-station", {
      method: "POST",
      headers: {
        origin: "https://otro.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "0".repeat(64) }),
    })
  ).status,
  403,
);
console.log(
  "Pantalla QR sin vínculo y vinculación desde otro origen rechazadas.",
);
