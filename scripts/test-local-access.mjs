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
  assert.equal(html.includes("Salarios primera quincena"), role === "admin");
  if (role === "mechanic") {
    assert.ok(!html.includes("Cuenta bancaria del taller"));
    assert.ok(!html.includes("Transportes San Jerónimo y Asociados"));
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
    role === "admin",
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
  console.log(`Acceso ${role}: sesión y datos por rol correctos.`);
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
