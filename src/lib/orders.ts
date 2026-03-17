import type { OrderRecord } from "@/types/database";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type WarrantyTone = "expired" | "warning" | "safe";

export type OrderFormState = {
  productName: string;
  purchaseDate: string;
  warrantyExpireAt: string;
  note: string;
};

export function emptyOrderForm(): OrderFormState {
  return {
    productName: "",
    purchaseDate: "",
    warrantyExpireAt: "",
    note: "",
  };
}

export function toOrderForm(order: OrderRecord): OrderFormState {
  return {
    productName: order.product_name,
    purchaseDate: order.purchase_date,
    warrantyExpireAt: order.warranty_expire_at,
    note: order.note,
  };
}

export function normalizeOrderForm(form: OrderFormState) {
  return {
    product_name: form.productName.trim(),
    purchase_date: form.purchaseDate,
    warranty_expire_at: form.warrantyExpireAt,
    note: form.note.trim(),
  };
}

export function formatDateLabel(dateValue: string) {
  if (!dateValue) {
    return "--";
  }

  return DATE_FORMATTER.format(new Date(`${dateValue}T00:00:00`));
}

export function getWarrantyStatus(dateValue: string, now = new Date()) {
  const expiresAt = new Date(`${dateValue}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const rawDays = (expiresAt.getTime() - today.getTime()) / millisecondsPerDay;
  const daysRemaining = Math.ceil(rawDays);

  if (daysRemaining < 0) {
    return {
      tone: "expired" as const,
      label: "已过期",
      detail: `已过期 ${Math.abs(daysRemaining)} 天`,
      daysRemaining,
    };
  }

  if (daysRemaining <= 30) {
    return {
      tone: "warning" as const,
      label: "即将到期",
      detail: daysRemaining === 0 ? "今天到期" : `${daysRemaining} 天后到期`,
      daysRemaining,
    };
  }

  return {
    tone: "safe" as const,
    label: "有效中",
    detail: `剩余 ${daysRemaining} 天`,
    daysRemaining,
  };
}

export function getProductInitials(productName: string) {
  const cleanName = productName.trim();

  if (!cleanName) {
    return "OR";
  }

  const parts = cleanName.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}
