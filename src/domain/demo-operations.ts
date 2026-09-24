import Decimal from "decimal.js";
import type { OperationsView } from "./operations-view";
import type { OrderView } from "./workshop-view";
import { assertOrderTransition } from "./order-lifecycle";
import { cashKinds } from "./cash";
import { accountNames } from "./accounts";

export function applyDemoOperation(
  kind: string,
  input: Record<string, unknown>,
  current: OperationsView,
  currentOrders: OrderView[],
) {
  const data = structuredClone(current);
  const orders = structuredClone(currentOrders);
  const id = crypto.randomUUID();
  const text = (key: string) => String(input[key] ?? "");
  switch (kind) {
    case "customer": {
      const entry = {
        id: text("id") || id,
        name: text("name"),
        document: text("document"),
        phone: text("phone"),
        email: text("email"),
        orders: 0,
      };
      const index = data.customers.findIndex((c) => c.id === entry.id);
      if (index < 0) data.customers.push(entry);
      else
        data.customers[index] = {
          ...entry,
          orders: data.customers[index].orders,
        };
      break;
    }
    case "member": {
      const entry = {
        id: text("id") || id,
        name: text("name"),
        email: text("email"),
        role: text("role"),
        active: Boolean(input.active),
      };
      const index = data.members.findIndex((m) => m.id === entry.id);
      if (index < 0) data.members.push(entry);
      else data.members[index] = entry;
      break;
    }
    case "supplier": {
      const entry = {id: text("id") || id, name: text("name"), phone: text("phone"), email: text("email"), address: text("address")};
      const index = data.suppliers.findIndex(s => s.id === entry.id);
      if(index < 0) data.suppliers.push(entry); else data.suppliers[index] = entry;
      break;
    }
    case "customer-delete":
    case "supplier-delete": {
      const contact = (kind === "customer-delete" ? data.customers : data.suppliers).find(c => c.id === text("id"));
      if (!contact) throw new Error("El contacto ya no está disponible.");
      contact.deletedAt = new Date().toISOString();
      break;
    }
    case "item": {
      const currentId = text("id") || id;
      if (data.items.some((i) => i.code === text("code") && i.id !== currentId))
        throw new Error("Esa referencia ya existe.");
      const currentItem = data.items.find((item) => item.id === currentId);
      const value = {
        id: currentId,
        businessCategoryId: text("businessCategoryId") || null,
        businessCategory: currentItem?.businessCategory,
        code: text("code"),
        name: text("name"),
        brand: text("brand"),
        kind: text("kind"),
        unit: text("unit"),
        reference: text("reference"),
        purchasePrice:
          text("kind") === "SERVICE" ? null : text("purchasePrice") || null,
        salePrice: text("salePrice") || null,
        notes: text("notes"),
      };
      const index = data.items.findIndex((i) => i.id === currentId);
      if (index >= 0) data.items[index] = value;
      else data.items.push(value);
      break;
    }
    case "task-note": {
      const task = data.tasks.find((t) => t.id === text("taskId"));
      if (!task) throw new Error("Tarea no encontrada.");
      task.notes ??= [];
      task.notes.unshift({
        id,
        body: text("body"),
        author: "Usuario de demostración",
        createdAt: new Date().toISOString(),
      });
      break;
    }
    case "task-edit": {
      const task = data.tasks.find((t) => t.id === text("taskId"));
      if (!task) throw new Error("Tarea no encontrada.");
      task.title = text("title");
      task.description = text("description");
      task.dueAt = text("dueAt") || null;
      task.members = input.memberIds as string[];
      task.version = (task.version ?? 0) + 1;
      const order = orders.find((o) => o.id === task.orderId);
      const nested = order?.tasks.find((t) => t.id === task.id);
      if (nested) nested.title = task.title;
      break;
    }
    case "task-archive": {
      data.archivedTasks ??= [];
      const source = input.restore ? data.archivedTasks : data.tasks;
      const target = input.restore ? data.tasks : data.archivedTasks;
      const index = source.findIndex((t) => t.id === text("taskId"));
      if (index < 0) throw new Error("Tarea no encontrada.");
      const [task] = source.splice(index, 1);
      task.deletedAt = input.restore ? null : new Date().toISOString();
      target.push(task);
      const order = orders.find((o) => o.id === task.orderId);
      if (order) {
        order.tasks = order.tasks.filter((t) => t.id !== task.id);
        if (input.restore)
          order.tasks.push({
            id: task.id,
            title: task.title,
            done: task.status === "DONE",
            status: task.status,
            minutes: 0,
          });
      }
      break;
    }
    case "offer":
      new Decimal(text("unitCost"));
      data.offers.unshift({
        id,
        itemId: text("itemId"),
        supplierId: text("supplierId"),
        condition: text("condition"),
        unitCost: text("unitCost"),
        reportedStock: text("reportedStock"),
        observedAt: text("observedAt"),
        evidence: text("evidence"),
      });
      break;
    case "task": {
      const members = (input.memberIds as string[]) ?? [];
      if (!members.length)
        throw new Error("Selecciona al menos un responsable.");
      const task = {
        id,
        description: text("description"),
        version: 0,
        title: text("title"),
        orderId: text("orderId") || null,
        status: "TODO",
        createdAt: new Date().toISOString(),
        dueAt: text("dueAt") || undefined,
        members,
      };
      data.tasks.unshift(task);
      const order = orders.find((o) => o.id === task.orderId);
      if (order) {
        order.tasks.push({
          id,
          title: task.title,
          done: false,
          status: "TODO",
          minutes: 0,
        });
        order.nextStep = task.title;
        order.responsible = members
          .map((m) => data.members.find((x) => x.id === m)?.name ?? "Miembro")
          .join(", ");
      }
      break;
    }
    case "task-status": {
      const task = data.tasks.find((t) => t.id === text("taskId"));
      if (!task) throw new Error("Tarea no encontrada.");
      task.status = text("status");
      const order = orders.find((o) => o.id === task.orderId);
      if (order) {
        const target = order.tasks.find((t) => t.id === task.id);
        if (target) {
          target.done = task.status === "DONE";
          target.status = task.status;
        }
        order.nextStep =
          order.tasks.find((t) => !t.done)?.title ??
          "Revisar trabajo terminado";
      }
      break;
    }
    case "order-status": {
      const order = orders.find((o) => o.id === text("orderId"));
      if (!order) throw new Error("Orden no encontrada.");
      assertOrderTransition(order.status, text("status"));
      if (
        ["QUALITY_REVIEW", "READY", "CLOSED"].includes(text("status")) &&
        order.tasks.some((t) => !t.done)
      )
        throw new Error("Termina las tareas pendientes antes de avanzar.");
      order.status = text("status");
      order.version = (order.version ?? 0) + 1;
      break;
    }
    case "stock": {
      const qty = new Decimal(text("quantity"));
      const cost = new Decimal(text("unitCost"));
      if (!qty.isFinite() || qty.lte(0) || cost.lt(0) || !cost.isFinite())
        throw new Error("Revisa cantidad y costo.");
      const incoming = ["RECEIPT", "ADJUSTMENT_IN"].includes(text("kind"));
      if (text("kind") === "CONSUMPTION" && !text("orderId"))
        throw new Error("El consumo requiere una orden.");
      let balance = data.balances.find(
        (b) =>
          b.itemId === text("itemId") &&
          b.locationId === text("locationId") &&
          b.condition === text("condition"),
      );
      if (!balance) {
        balance = {
          itemId: text("itemId"),
          locationId: text("locationId"),
          condition: text("condition"),
          quantity: "0",
          reserved: "0",
          materialCost: "0",
        };
        data.balances.push(balance);
      }
      if (
        !incoming &&
        new Decimal(balance.quantity).minus(balance.reserved).lt(qty)
      )
        throw new Error("No hay existencias disponibles suficientes.");
      const amount = incoming
        ? qty.mul(cost).toDecimalPlaces(2)
        : new Decimal(balance.materialCost)
            .mul(qty)
            .div(balance.quantity)
            .toDecimalPlaces(2);
      const delta = incoming ? qty : qty.negated();
      const value = incoming ? amount : amount.negated();
      balance.quantity = new Decimal(balance.quantity).plus(delta).toString();
      balance.materialCost = new Decimal(balance.materialCost)
        .plus(value)
        .toFixed(2);
      if (text("kind") === "RECEIPT" && cost.gt(0)) {
        const item = data.items.find((entry) => entry.id === balance.itemId);
        if (item) item.purchasePrice = cost.toFixed(2);
      }
      data.movements.unshift({
        id,
        itemId: balance.itemId,
        locationId: balance.locationId,
        condition: balance.condition,
        quantity: delta.toString(),
        materialAmount: value.toFixed(2),
        kind: text("kind"),
        reason: text("reason"),
        date: new Date().toISOString(),
        reversed: false,
      });
      break;
    }
    case "stock-reversal": {
      const movement = data.movements.find((m) => m.id === text("movementId"));
      if (!movement || movement.reversed || movement.kind === "REVERSAL")
        throw new Error("No se puede revertir ese movimiento.");
      const balance = data.balances.find(
        (b) =>
          b.itemId === movement.itemId &&
          b.locationId === movement.locationId &&
          b.condition === movement.condition,
      )!;
      const qty = new Decimal(balance.quantity).minus(movement.quantity);
      const value = new Decimal(balance.materialCost).minus(
        movement.materialAmount,
      );
      if (
        qty.lt(balance.reserved) ||
        value.lt(0) ||
        (qty.eq(0) && !value.eq(0))
      )
        throw new Error(
          "Revisa los movimientos posteriores antes de revertir.",
        );
      balance.quantity = qty.toString();
      balance.materialCost = value.toFixed(2);
      movement.reversed = true;
      data.movements.unshift({
        ...movement,
        id,
        quantity: new Decimal(movement.quantity).negated().toString(),
        materialAmount: new Decimal(movement.materialAmount)
          .negated()
          .toFixed(2),
        kind: "REVERSAL",
        reason: text("reason"),
        date: new Date().toISOString(),
        reversed: false,
      });
      break;
    }
    case "account": {
      if (!accountNames.some(name => name === text("name"))) throw new Error("Selecciona una cuenta válida.");
      const balance = new Decimal(text("openingBalance"));
      if (!balance.isFinite() || balance.lt(0))
        throw new Error("Revisa el saldo inicial.");
      if (data.accounts.some((a) => a.name === text("name")))
        throw new Error("Ya existe una cuenta con ese nombre.");
      data.accounts.push({
        id,
        name: text("name"),
        balance: balance.toFixed(2),
      });
      break;
    }
    case "obligation": {
      const amount = new Decimal(text("amount"));
      if (!amount.isFinite() || amount.lte(0))
        throw new Error("Revisa el valor de la obligación.");
      data.obligations.push({
        id,
        title: text("title"),
        category: text("category"),
        period: text("period"),
        amount: amount.toFixed(2),
        paid: "0",
        dueOn: text("dueOn"),
      });
      break;
    }
    case "cash-transfer": {
      const source = data.accounts.find(a => a.id === text("sourceAccountId"));
      const target = data.accounts.find(a => a.id === text("destinationAccountId"));
      if(!source || !target || source.id === target.id) throw new Error("Selecciona dos cuentas diferentes.");
      const amount = new Decimal(text("amount"));
      if(!amount.isFinite() || amount.lte(0)) throw new Error("Revisa el valor de la transferencia.");
      if(new Decimal(source.balance).lt(amount)) throw new Error("La cuenta de origen no tiene saldo suficiente.");
      source.balance = new Decimal(source.balance).minus(amount).toFixed(2);
      target.balance = new Decimal(target.balance).plus(amount).toFixed(2);
      for(const [account,other,direction] of [[source,target,"OUT"],[target,source,"IN"]] as const) data.cashEntries.unshift({id:crypto.randomUUID(),transferId:id,accountId:account.id,obligationId:null,kind:"TRANSFER",direction,amount:amount.toFixed(2),counterparty:other.name,reference:text("reference"),note:text("note"),occurredOn:text("occurredOn"),reversed:false});
      break;
    }
    case "cash": {
      const account = data.accounts.find((a) => a.id === text("accountId"));
      if (!account) throw new Error("Selecciona una cuenta.");
      const nature = cashKinds[text("kind") as keyof typeof cashKinds];
      if (!nature) throw new Error("Selecciona el tipo de movimiento.");
      const amount = new Decimal(text("amount"));
      if (!amount.isFinite() || amount.lte(0))
        throw new Error("Revisa el valor del movimiento.");
      const obligation = data.obligations.find(
        (o) => o.id === text("obligationId"),
      );
      if (
        obligation &&
        (text("kind") !== "EXPENSE_PAYMENT" ||
          new Decimal(obligation.paid).plus(amount).gt(obligation.amount))
      )
        throw new Error(
          "Revisa el tipo de pago y el saldo pendiente de la obligación.",
        );
      const balance = new Decimal(account.balance).plus(
        nature.direction === "IN" ? amount : amount.negated(),
      );
      if (balance.lt(0))
        throw new Error("La cuenta no tiene saldo suficiente.");
      account.balance = balance.toFixed(2);
      if (obligation)
        obligation.paid = new Decimal(obligation.paid).plus(amount).toFixed(2);
      data.cashEntries.unshift({
        id,
        accountId: account.id,
        obligationId: obligation?.id ?? null,
        amount: amount.toFixed(2),
        direction: nature.direction,
        kind: text("kind"),
        counterparty: text("counterparty"),
        reference: text("reference"),
        note: text("note"),
        occurredOn: text("occurredOn"),
        reversed: false,
      });
      break;
    }
    case "cash-reversal": {
      const original = data.cashEntries.find((e) => e.id === text("entryId"));
      if (!original || original.reversed || original.kind === "REVERSAL")
        throw new Error("Ese movimiento no admite otra reversión.");
      if(original.transferId) {
        const pair=data.cashEntries.filter(e=>e.transferId===original.transferId && e.kind==="TRANSFER");
        if(pair.length!==2 || pair.some(e=>e.reversed)) throw new Error("Esta transferencia ya fue revertida.");
        for(const entry of pair) {
          const account=data.accounts.find(a=>a.id===entry.accountId)!;
          const balance=new Decimal(account.balance).plus(entry.direction==="OUT"?entry.amount:new Decimal(entry.amount).negated());
          if(balance.lt(0)) throw new Error("La cuenta de destino no tiene saldo suficiente para devolver el dinero.");
          account.balance=balance.toFixed(2);entry.reversed=true;
          data.cashEntries.unshift({...entry,id:crypto.randomUUID(),direction:entry.direction==="IN"?"OUT":"IN",kind:"REVERSAL",note:text("reason"),occurredOn:text("occurredOn"),reversed:false});
        }
        break;
      }
      const account = data.accounts.find((a) => a.id === original.accountId)!;
      const direction = original.direction === "IN" ? "OUT" : "IN";
      const balance = new Decimal(account.balance).plus(
        direction === "IN"
          ? original.amount
          : new Decimal(original.amount).negated(),
      );
      if (balance.lt(0))
        throw new Error("No hay saldo para revertir esta entrada.");
      account.balance = balance.toFixed(2);
      original.reversed = true;
      const obligation = data.obligations.find(
        (o) => o.id === original.obligationId,
      );
      if (obligation)
        obligation.paid = new Decimal(obligation.paid)
          .minus(original.amount)
          .toFixed(2);
      data.cashEntries.unshift({
        ...original,
        id,
        direction,
        kind: "REVERSAL",
        note: text("reason"),
        occurredOn: text("occurredOn"),
        reversed: false,
      });
      break;
    }
    default:
      throw new Error("Operación no disponible en la demostración.");
  }
  if (
    ["task", "task-status", "task-edit", "task-note", "task-archive"].includes(
      kind,
    )
  ) {
    const task = [...data.tasks, ...(data.archivedTasks ?? [])].find(
      (t) => t.id === (kind === "task" ? id : text("taskId")),
    );
    const previous = [...current.tasks, ...(current.archivedTasks ?? [])].find(
      (t) => t.id === text("taskId"),
    );
    if (task) {
      const action =
        kind === "task"
          ? "TASK_ASSIGNED"
          : kind === "task-status"
            ? "TASK_STATUS_CHANGED"
            : kind === "task-edit"
              ? "TASK_EDITED"
              : kind === "task-note"
                ? "TASK_NOTE_ADDED"
                : input.restore
                  ? "TASK_RESTORED"
                  : "TASK_DELETED";
      task.history ??= [];
      task.history.unshift({
        id: crypto.randomUUID(),
        action,
        author: "Usuario de demostración",
        createdAt: new Date().toISOString(),
        details:
          kind === "task-status"
            ? { from: previous?.status, to: task.status }
            : kind === "task-edit"
              ? {
                  before: { title: previous?.title },
                  after: { title: task.title },
                }
              : kind === "task-archive"
                ? { reason: text("reason") }
                : {},
      });
      if (["task-status", "task-archive"].includes(kind))
        task.version = (task.version ?? 0) + 1;
    }
  }
  return { data, orders };
}
