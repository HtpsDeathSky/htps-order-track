"use client";

import { useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import {
  emptyOrderForm,
  formatDateLabel,
  getProductInitials,
  getWarrantyStatus,
  normalizeOrderForm,
  toOrderForm,
  type OrderFormState,
  type WarrantyTone,
} from "@/lib/orders";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OrderRecord, ProfileRole } from "@/types/database";

type FilterKey = "all" | "warning" | "expired";
type FormMode = "create" | "edit";
type NoticeTone = "error" | "success";

type Notice = {
  tone: NoticeTone;
  text: string;
};

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "warning", label: "30天内" },
  { key: "expired", label: "已过期" },
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getToneStyles(tone: WarrantyTone) {
  if (tone === "expired") {
    return {
      badge: "bg-rose-100 text-rose-700",
      dot: "bg-rose-500",
      accent: "from-rose-100 to-rose-50",
    };
  }

  if (tone === "warning") {
    return {
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500",
      accent: "from-amber-100 to-amber-50",
    };
  }

  return {
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    accent: "from-emerald-100 to-emerald-50",
  };
}

function countByTone(orders: OrderRecord[], tone: WarrantyTone) {
  return orders.filter((order) => getWarrantyStatus(order.warranty_expire_at).tone === tone)
    .length;
}

function validateOrderForm(form: OrderFormState) {
  const normalized = normalizeOrderForm(form);

  if (!normalized.product_name) {
    return "商品名称不能为空。";
  }

  if (!normalized.purchase_date || !normalized.warranty_expire_at) {
    return "请完整填写购买时间和售后到期时间。";
  }

  if (normalized.warranty_expire_at < normalized.purchase_date) {
    return "售后到期时间不能早于购买时间。";
  }

  return null;
}

export function OrderTrackerApp() {
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<Session | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [form, setForm] = useState<OrderFormState>(emptyOrderForm());
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [loadingSession, setLoadingSession] = useState(Boolean(supabase));
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const query = deferredSearch.trim().toLowerCase();

  const filteredOrders = orders.filter((order) => {
    const status = getWarrantyStatus(order.warranty_expire_at);
    const matchesFilter =
      filter === "all" ||
      (filter === "warning" && status.tone === "warning") ||
      (filter === "expired" && status.tone === "expired");
    const matchesSearch =
      !query ||
      order.product_name.toLowerCase().includes(query) ||
      order.note.toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  async function loadProfileRole(userId: string) {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const profile = data as { role: ProfileRole } | null;

    if (!error && profile) {
      setProfileRole(profile.role);
    }
  }

  function switchToCreateMode() {
    setFormMode("create");
    setSelectedOrderId(null);
    setForm(emptyOrderForm());
  }

  function openOrderEditor(order: OrderRecord) {
    setSelectedOrderId(order.id);
    setFormMode("edit");
    setForm(toOrderForm(order));
  }

  async function loadOrders(focusId?: string | null) {
    if (!supabase) {
      return;
    }

    setLoadingOrders(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("warranty_expire_at", { ascending: true })
      .order("purchase_date", { ascending: false });

    setLoadingOrders(false);

    if (error) {
      setNotice({ tone: "error", text: `订单读取失败：${error.message}` });
      return;
    }

    const nextOrders = (data ?? []) as OrderRecord[];
    setOrders(nextOrders);

    const focusedOrder =
      nextOrders.find((order) => order.id === focusId) ??
      nextOrders.find((order) => order.id === selectedOrderId) ??
      nextOrders[0] ??
      null;

    if (!focusedOrder) {
      if (formMode === "edit") {
        switchToCreateMode();
      } else {
        setSelectedOrderId(null);
      }

      return;
    }

    setSelectedOrderId(focusedOrder.id);

    if (formMode === "edit") {
      setForm(toOrderForm(focusedOrder));
    }
  }

  const applySession = useEffectEvent(async (nextSession: Session | null) => {
    setSession(nextSession);
    setProfileRole(null);

    if (!nextSession) {
      setOrders([]);
      switchToCreateMode();
      setLoadingOrders(false);
      setLoadingSession(false);
      return;
    }

    setLoadingSession(false);
    void loadProfileRole(nextSession.user.id);
    void loadOrders();
  });

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error) {
          setNotice({ tone: "error", text: "无法读取登录状态，请刷新页面重试。" });
          setLoadingSession(false);
          return;
        }

        void applySession(data.session);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setNotice({ tone: "error", text: "初始化会话失败，请刷新页面重试。" });
        setLoadingSession(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      void applySession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      return;
    }

    setAuthSubmitting(true);
    setNotice(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password,
    });

    setAuthSubmitting(false);

    if (error) {
      setNotice({ tone: "error", text: `登录失败：${error.message}` });
      return;
    }

    setNotice({ tone: "success", text: "登录成功，正在载入订单。" });
    setAuthForm({ email: authForm.email.trim(), password: "" });
  }

  async function handleLogout() {
    if (!supabase) {
      return;
    }

    setNotice(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setNotice({ tone: "error", text: `退出失败：${error.message}` });
      return;
    }

    setNotice({ tone: "success", text: "你已退出登录。" });
  }

  async function handleOrderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !session) {
      return;
    }

    const validationError = validateOrderForm(form);

    if (validationError) {
      setNotice({ tone: "error", text: validationError });
      return;
    }

    const payload = normalizeOrderForm(form);
    setSubmitting(true);
    setNotice(null);

    if (formMode === "edit" && selectedOrder) {
      const { data, error } = await supabase
        .from("orders")
        .update({
          user_id: selectedOrder.user_id,
          ...payload,
        })
        .eq("id", selectedOrder.id)
        .select("*")
        .single();

      setSubmitting(false);

      if (error) {
        setNotice({ tone: "error", text: `更新失败：${error.message}` });
        return;
      }

      const updatedOrder = data as OrderRecord | null;

      setNotice({ tone: "success", text: "订单已更新。" });
      await loadOrders(updatedOrder?.id ?? selectedOrder.id);
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id: session.user.id,
        ...payload,
      })
      .select("*")
      .single();

    setSubmitting(false);

    if (error) {
      setNotice({ tone: "error", text: `创建失败：${error.message}` });
      return;
    }

    const createdOrder = data as OrderRecord | null;

    setFormMode("edit");
    setNotice({ tone: "success", text: "订单已创建。" });
    await loadOrders(createdOrder?.id ?? null);
  }

  async function handleDelete() {
    if (!supabase || !session || !selectedOrder) {
      return;
    }

    const confirmed = window.confirm(`确认删除「${selectedOrder.product_name}」吗？`);

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setNotice(null);

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", selectedOrder.id);

    setSubmitting(false);

    if (error) {
      setNotice({ tone: "error", text: `删除失败：${error.message}` });
      return;
    }

    switchToCreateMode();
    setNotice({ tone: "success", text: "订单已删除。" });
    await loadOrders();
  }

  if (!supabase) {
    return <ConfigurationScreen />;
  }

  if (!session) {
    return (
      <LoginScreen
        authForm={authForm}
        authSubmitting={authSubmitting}
        loadingSession={loadingSession}
        notice={notice}
        onAuthFormChange={setAuthForm}
        onSubmit={handleLoginSubmit}
      />
    );
  }

  const expiredCount = countByTone(orders, "expired");
  const warningCount = countByTone(orders, "warning");

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="rounded-[32px] border border-white/70 bg-[var(--panel)] px-5 py-4 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                HTPS Order Track
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  售后到期视图
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)] sm:text-base">
                  以 Telegram 风格集中查看订单、快速录入并按售后到期时间排序。
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 rounded-[26px] bg-white/70 p-4 shadow-sm sm:flex-row sm:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  当前账号
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {session.user.email}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {profileRole === "admin" ? "管理员" : "普通用户"}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                退出登录
              </button>
            </div>
          </div>
        </header>

        {notice ? (
          <div
            className={cn(
              "rounded-[24px] border px-4 py-3 text-sm shadow-sm backdrop-blur-xl",
              notice.tone === "error"
                ? "border-rose-200 bg-rose-50/90 text-rose-700"
                : "border-emerald-200 bg-emerald-50/90 text-emerald-700",
            )}
          >
            {notice.text}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="订单总数" value={String(orders.length)} detail="按到期时间自动排序" />
          <MetricCard
            label="30 天内到期"
            value={String(warningCount)}
            detail="建议优先跟进售后"
            accent="warning"
          />
          <MetricCard
            label="已过期"
            value={String(expiredCount)}
            detail="可集中处理异常订单"
            accent="danger"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="rounded-[32px] border border-white/70 bg-[var(--panel)] p-4 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    {profileRole === "admin" ? "全部订单" : "我的订单"}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">
                    到期时间队列
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    switchToCreateMode();
                    setNotice(null);
                  }}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-strong)]"
                >
                  新建订单
                </button>
              </div>

              <div className="rounded-[26px] bg-white/80 p-3 shadow-sm">
                <div className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-3 py-2">
                  <span className="text-sm text-slate-400">⌕</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索商品名或备注"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setFilter(option.key)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition",
                        filter === option.key
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {loadingOrders ? (
                  <div className="rounded-[26px] border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
                    正在同步订单...
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="rounded-[26px] border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
                    还没有匹配的订单，先创建一条试试。
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <OrderListCard
                      key={order.id}
                      isActive={order.id === selectedOrderId}
                      order={order}
                      onSelect={() => {
                        openOrderEditor(order);
                        setNotice(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <OrderDetailCard order={selectedOrder} />

            <section className="rounded-[32px] border border-white/70 bg-[var(--panel)] p-4 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    {formMode === "edit" ? "编辑模式" : "录入模式"}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">
                    {formMode === "edit" ? "编辑订单信息" : "新增订单"}
                  </h2>
                </div>

                {formMode === "edit" ? (
                  <button
                    type="button"
                    onClick={() => {
                      switchToCreateMode();
                      setNotice(null);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    切换到新建
                  </button>
                ) : null}
              </div>

              <form className="mt-5 grid gap-4" onSubmit={handleOrderSubmit}>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">商品名称</span>
                  <input
                    value={form.productName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        productName: event.target.value,
                      }))
                    }
                    placeholder="例如：iPhone 16 Pro"
                    className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">购买时间</span>
                    <input
                      type="date"
                      value={form.purchaseDate}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          purchaseDate: event.target.value,
                        }))
                      }
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-700">售后到期时间</span>
                    <input
                      type="date"
                      value={form.warrantyExpireAt}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          warrantyExpireAt: event.target.value,
                        }))
                      }
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">备注</span>
                  <textarea
                    value={form.note}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="例如：发票已归档，售后联系人已记录"
                    className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>

                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
                  <div className="text-sm text-[var(--muted)]">
                    保存后会立即按售后到期时间重新排序。
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {formMode === "edit" && selectedOrder ? (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={submitting}
                        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        删除订单
                      </button>
                    ) : null}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting
                        ? "正在保存..."
                        : formMode === "edit"
                          ? "保存修改"
                          : "创建订单"}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginScreen({
  authForm,
  authSubmitting,
  loadingSession,
  notice,
  onAuthFormChange,
  onSubmit,
}: {
  authForm: { email: string; password: string };
  authSubmitting: boolean;
  loadingSession: boolean;
  notice: Notice | null;
  onAuthFormChange: (value: { email: string; password: string }) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[36px] border border-white/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.9),rgba(226,240,255,0.86))] p-6 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:p-8">
          <div className="absolute -left-12 top-8 h-36 w-36 rounded-full bg-sky-200/60 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-52 w-52 rounded-full bg-cyan-100/70 blur-3xl" />

          <div className="relative space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              HTPS Order Track
            </div>

            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                一个更清晰的
                <span className="block text-[var(--accent-strong)]">订单售后看板</span>
              </h1>
              <p className="max-w-2xl text-base leading-8 text-[var(--muted)] sm:text-lg">
                使用 Supabase 鉴权登录，集中录入订单信息，并根据售后到期时间快速查看哪些订单需要优先处理。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureCard
                title="到期排序"
                detail="自动按售后截止时间排列，优先看临期订单。"
              />
              <FeatureCard
                title="即时录入"
                detail="购买时间、到期时间和备注统一归档。"
              />
              <FeatureCard
                title="轻量部署"
                detail="前端直接部署到 Vercel，数据库放在 Supabase。"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[36px] border border-white/70 bg-[var(--panel-strong)] p-6 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:p-8">
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                Email Login
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                登录查看订单
              </h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                使用你刚刚在 Supabase 中创建的账号登录。若不开放注册，就由管理员在后台预创建账号。
              </p>
            </div>

            {notice ? (
              <div
                className={cn(
                  "rounded-[22px] border px-4 py-3 text-sm",
                  notice.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700",
                )}
              >
                {notice.text}
              </div>
            ) : null}

            <form className="grid gap-4" onSubmit={onSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">邮箱</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    onAuthFormChange({
                      ...authForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="you@example.com"
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">密码</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    onAuthFormChange({
                      ...authForm,
                      password: event.target.value,
                    })
                  }
                  placeholder="请输入密码"
                  className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <button
                type="submit"
                disabled={loadingSession || authSubmitting}
                className="mt-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingSession
                  ? "检查登录状态..."
                  : authSubmitting
                    ? "正在登录..."
                    : "登录"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function ConfigurationScreen() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center">
        <section className="w-full rounded-[36px] border border-white/70 bg-[var(--panel-strong)] p-6 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            Missing Env
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            还没有配置 Supabase 环境变量
          </h1>
          <p className="mt-3 text-base leading-8 text-[var(--muted)]">
            先把 `D:\project\htps-order-track\.env.example` 复制成 `.env.local`，再填入
            `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
          </p>

          <div className="mt-6 rounded-[26px] bg-slate-950 px-4 py-4 font-mono text-sm text-sky-100">
            <p>NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co</p>
            <p className="mt-2">NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key</p>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            这两个值也需要同步配置到 Vercel 的项目环境变量中。
          </p>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent = "default",
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "default" | "warning" | "danger";
}) {
  const accentClass =
    accent === "warning"
      ? "from-amber-50 to-amber-100/80"
      : accent === "danger"
        ? "from-rose-50 to-rose-100/80"
        : "from-white to-sky-50";

  return (
    <article
      className={cn(
        "rounded-[28px] border border-white/70 bg-gradient-to-br p-5 shadow-[var(--shadow-xl)] backdrop-blur-xl",
        accentClass,
      )}
    >
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function FeatureCard({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="rounded-[24px] border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{detail}</p>
    </article>
  );
}

function OrderListCard({
  isActive,
  order,
  onSelect,
}: {
  isActive: boolean;
  order: OrderRecord;
  onSelect: () => void;
}) {
  const status = getWarrantyStatus(order.warranty_expire_at);
  const tone = getToneStyles(status.tone);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-[26px] border p-4 text-left transition",
        isActive
          ? "border-sky-300 bg-sky-50/90 shadow-sm"
          : "border-white/70 bg-white/75 hover:border-sky-200 hover:bg-white",
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-semibold text-slate-700",
          tone.accent,
        )}
      >
        {getProductInitials(order.product_name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">
            {order.product_name}
          </p>
          <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", tone.badge)}>
            {status.label}
          </span>
        </div>

        <div className="mt-2 flex flex-col gap-1 text-sm text-[var(--muted)]">
          <p>购买时间：{formatDateLabel(order.purchase_date)}</p>
          <p>售后到期：{formatDateLabel(order.warranty_expire_at)}</p>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500">
          <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
          {status.detail}
        </div>
      </div>
    </button>
  );
}

function OrderDetailCard({ order }: { order: OrderRecord | null }) {
  if (!order) {
    return (
      <section className="rounded-[32px] border border-white/70 bg-[var(--panel)] p-6 shadow-[var(--shadow-xl)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">订单详情</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">请选择一条订单</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
          选择左侧列表中的任意订单，可以查看更详细的信息并直接修改内容。
        </p>
      </section>
    );
  }

  const status = getWarrantyStatus(order.warranty_expire_at);
  const tone = getToneStyles(status.tone);

  return (
    <section className="rounded-[32px] border border-white/70 bg-[var(--panel)] p-5 shadow-[var(--shadow-xl)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br text-base font-semibold text-slate-700",
              tone.accent,
            )}
          >
            {getProductInitials(order.product_name)}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">订单详情</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {order.product_name}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{status.detail}</p>
          </div>
        </div>

        <span className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", tone.badge)}>
          {status.label}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <DetailTile label="购买时间" value={formatDateLabel(order.purchase_date)} />
        <DetailTile label="售后到期" value={formatDateLabel(order.warranty_expire_at)} />
        <DetailTile label="最后更新" value={formatDateLabel(order.updated_at.slice(0, 10))} />
      </div>

      <div className="mt-4 rounded-[24px] bg-white/75 p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">备注</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {order.note || "暂无备注"}
        </p>
      </div>
    </section>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] bg-white/75 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </article>
  );
}
