import { it } from "vitest";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
it("connects reception, task time, private notes and calendar without persisting fixtures", async () => {
  const { db } = await import("@/server/db");
  const { setActor } = await import("@/server/commands");
  const { readNoteImage } = await import("@/server/note-images");
  const { storageAdmin, attachmentBucket } = await import(
    "@/server/private-storage"
  );
  const sharp = (await import("sharp")).default;
  const uploadedPaths: string[] = [];
  const { receiveOrder } = await import("@/server/operations-service");
  const { recordTaskTime } = await import("@/server/task-service");
  const { getOrders } = await import("@/server/workshop-query");
  const { listOrganizer, saveOrganizer, deleteOrganizer } = await import(
    "@/server/organizer-service"
  );
  const cache = globalThis as unknown as { workshopDb?: ReturnType<typeof db> };
  const root = db(),
    original = cache.workshopDb;
  const rollback = new Error("verification complete: rollback");
  try {
    await root.$transaction(
      async (tx) => {
        // Route the domain services' transactions to this single rollback boundary.
        cache.workshopDb = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return (run: (tx: unknown) => unknown) => run(tx);
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as unknown as ReturnType<typeof db>;
        const admin = await tx.member.findFirstOrThrow({
          where: { role: "ADMIN", active: true },
        });
        await setActor(tx, admin);
        const office = await tx.member.create({
          data: {
            id: randomUUID(),
            role: "OFFICE",
            name: "Rollback service office",
            email: `${randomUUID()}@example.invalid`,
          },
        });
        const mechanic = await tx.member.create({
          data: {
            id: randomUUID(),
            role: "MECHANIC",
            name: "Rollback service mechanic",
            email: `${randomUUID()}@example.invalid`,
          },
        });
        const location = await tx.location.findFirstOrThrow();
        const category = await tx.businessCategory.findFirstOrThrow({
          where: { active: true },
        });
        const customer = await tx.customer.create({
          data: { name: "Rollback service customer" },
        });
        const input = {
          requestId: randomUUID(),
          title: "Rollback pump service",
          customerId: customer.id,
          reference: "",
          kind: "COMPONENT",
          purpose: "CUSTOMER_REPAIR",
          problem: "Pressure test required",
          locationId: location.id,
          businessCategoryId: category.id,
          responsibleId: mechanic.id,
          dueAt: "2026-09-20",
          initialTasks: [
            {
              title: "Pressure test",
              memberId: mechanic.id,
              plannedMinutes: 60,
            },
          ],
        };
        const order = await receiveOrder(office, input);
        assert.deepEqual(await receiveOrder(office, input), order);
        const task = await tx.task.findFirstOrThrow({
          where: { orderId: String(order.id) },
        });
        assert.equal(
          await tx.task.count({ where: { orderId: String(order.id) } }),
          1,
        );
        await recordTaskTime(office, {
          taskId: task.id,
          memberId: mechanic.id,
          idempotencyKey: randomUUID(),
          minutes: 45,
          workedOn: "2026-09-15",
          note: "Pressure verified",
        });
        const view = (await getOrders(mechanic, [String(order.id)]))[0];
        assert.equal(view.responsibleId, mechanic.id);
        assert.equal(view.tasks[0].minutes, 45);
        assert.equal(view.dueAt, "2026-09-20T22:00:00.000Z");
        const noteInput = {
          requestId: randomUUID(),
          kind: "NOTE",
          visibility: "PERSONAL",
          title: "Private service test",
          richContent: {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: "Referencias" }],
              },
              {
                type: "taskList",
                content: [
                  {
                    type: "taskItem",
                    attrs: { checked: true },
                    content: [
                      {
                        type: "paragraph",
                        content: [
                          { type: "text", text: "Confirmar con proveedor" },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: "image",
                attrs: {
                  src: `data:image/png;base64,${(
                    await sharp({
                      create: {
                        width: 4,
                        height: 4,
                        channels: 3,
                        background: "#123456",
                      },
                    })
                      .png()
                      .toBuffer()
                  ).toString("base64")}`,
                  alt: "Referencia",
                },
              },
            ],
          },
        };
        const note = await saveOrganizer(office, noteInput);
        assert.deepEqual(await saveOrganizer(office, noteInput), note);
        const image = await tx.attachment.findFirstOrThrow({
          where: { entityType: "NOTE", entityId: String(note.id) },
        });
        uploadedPaths.push(image.path);
        assert.ok((await readNoteImage(office, image.id)).bytes.length > 0);
        await assert.rejects(readNoteImage(admin, image.id));
        await assert.rejects(readNoteImage(mechanic, image.id));
        const savedNote = (await listOrganizer(office)).find(
          (n) => n.id === note.id,
        )!;
        assert.ok(savedNote.body.includes("Confirmar con proveedor"));
        assert.ok(
          JSON.stringify(savedNote.richContent).includes(
            `/api/organizer/images?id=${image.id}`,
          ),
        );
        assert.ok(!JSON.stringify(savedNote.richContent).includes("base64"));
        await saveOrganizer(office, {
          ...savedNote,
          requestId: randomUUID(),
          pinned: true,
        });
        assert.equal(
          await tx.attachment.count({ where: { entityId: String(note.id) } }),
          1,
        );
        await assert.rejects(
          saveOrganizer(admin, {
            requestId: randomUUID(),
            kind: "NOTE",
            visibility: "GENERAL",
            title: "Forged image reference",
            richContent: savedNote.richContent,
          }),
        );
        const todo = await saveOrganizer(office, {
          requestId: randomUUID(),
          kind: "TODO",
          visibility: "GENERAL",
          title: "Shared service test",
          calendar: true,
          startsAt: "2026-09-18T08:30:00-05:00",
          orderId: order.id,
        });
        const mine = await listOrganizer(office);
        assert.ok(mine.some((e) => e.id === note.id));
        assert.ok(!(await listOrganizer(admin)).some((e) => e.id === note.id));
        const visible = (await listOrganizer(admin)).find(
          (e) => e.id === todo.id,
        )!;
        assert.ok(visible.calendar);
        await assert.rejects(
          saveOrganizer(office, {
            ...visible,
            version: 99,
            requestId: randomUUID(),
          }),
          /cambió/,
        );
        await saveOrganizer(office, {
          ...visible,
          completed: true,
          requestId: randomUUID(),
        });
        const edited = (await listOrganizer(admin)).find(
          (e) => e.id === todo.id,
        )!;
        assert.ok(edited.completed);
        assert.equal(edited.updatedBy, office.name);
        await assert.rejects(
          deleteOrganizer(office, {
            id: todo.id,
            version: edited.version,
            requestId: randomUUID(),
          }),
        );
        await deleteOrganizer(admin, {
          id: todo.id,
          version: edited.version,
          requestId: randomUUID(),
        });
        assert.ok(!(await listOrganizer(office)).some((e) => e.id === todo.id));
        console.log(
          "PASS: atomic order/tasks, replay, mechanic visibility, attributed time, private/shared CRUD, schedule, stale version, admin-only shared deletion.",
        );
        throw rollback;
      },
      { timeout: 60000, isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    cache.workshopDb = original;
    if (uploadedPaths.length) {
      const removed = await storageAdmin()
        .from(attachmentBucket)
        .remove(uploadedPaths);
      assert.equal(removed.error, null);
    }
    await root.$disconnect();
  }
}, 60000);
