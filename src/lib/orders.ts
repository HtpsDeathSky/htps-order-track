import type { OrderRecord } from "@/types/database";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type WarrantyTone = "expired" | "warning" | "safe";

export type OrderFormState = {
  productName: string;
  warrantyExpireAt: string;
  note: string;
};

export type BatchOrderParseResult = {
  items: OrderFormState[];
  errors: string[];
};

export function emptyOrderForm(): OrderFormState {
  return {
    productName: "",
    warrantyExpireAt: "",
    note: "",
  };
}

export function toOrderForm(order: OrderRecord): OrderFormState {
  return {
    productName: order.product_name,
    warrantyExpireAt: order.warranty_expire_at,
    note: order.note,
  };
}

export function normalizeOrderForm(form: OrderFormState) {
  const normalizedWarrantyExpireAt = parseFlexibleDateInput(form.warrantyExpireAt);

  return {
    product_name: form.productName.trim(),
    warranty_expire_at: normalizedWarrantyExpireAt ?? "",
    note: form.note.trim(),
  };
}

export function formatDateLabel(dateValue: string) {
  const normalizedDate = parseFlexibleDateInput(dateValue);

  if (!normalizedDate) {
    return "--";
  }

  return DATE_FORMATTER.format(new Date(`${normalizedDate}T00:00:00`));
}

export function getWarrantyStatus(dateValue: string, now = new Date()) {
  const normalizedDate = parseFlexibleDateInput(dateValue);

  if (!normalizedDate) {
    return {
      tone: "warning" as const,
      label: "日期待补充",
      detail: "请输入有效日期",
      daysRemaining: Number.NaN,
    };
  }

  const expiresAt = new Date(`${normalizedDate}T00:00:00`);
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

export function parseFlexibleDateInput(dateValue: string) {
  const trimmedDate = dateValue.trim();

  if (!trimmedDate) {
    return null;
  }

  const match = trimmedDate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (!match) {
    return null;
  }

  const [, yearToken, monthToken, dayToken] = match;
  const year = Number(yearToken);
  const month = Number(monthToken);
  const day = Number(dayToken);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const normalizedDate = `${yearToken}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsedDate = new Date(`${normalizedDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() + 1 !== month ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return normalizedDate;
}

export function parseBatchOrderLines(inputValue: string): BatchOrderParseResult {
  const lines = inputValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: OrderFormState[] = [];
  const errors: string[] = [];

  for (const [index, line] of lines.entries()) {
    const parts = splitBatchLine(line);

    if (parts.length < 2) {
      errors.push(`第 ${index + 1} 行字段不足，至少需要商品名和售后到期时间。`);
      continue;
    }

    const [productName = "", secondValue = "", thirdValue = "", ...remainingParts] = parts;
    const secondDate = parseFlexibleDateInput(secondValue);
    const thirdDate = parseFlexibleDateInput(thirdValue);
    const usesLegacyLayout = Boolean(secondDate && thirdDate);

    items.push({
      productName,
      warrantyExpireAt: usesLegacyLayout ? thirdValue : secondValue,
      note: usesLegacyLayout ? remainingParts.join(" | ") : parts.slice(2).join(" | "),
    });
  }

  if (lines.length === 0) {
    errors.push("请至少输入一条订单。");
  }

  return { items, errors };
}

function splitBatchLine(line: string) {
  const pipeParts = line
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (pipeParts.length >= 3) {
    return pipeParts;
  }

  const tabParts = line
    .split("\t")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (tabParts.length >= 3) {
    return tabParts;
  }

  const commaParts = line
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return commaParts;
}
