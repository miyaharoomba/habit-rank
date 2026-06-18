"use client";

import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { Laptop, LogOut, Moon, Sun, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy,
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-confirm-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl">
        <h3 id="settings-confirm-title" className="text-lg font-semibold">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-secondary/40"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={[
              "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60",
              danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-90",
            ].join(" ")}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-10 min-w-[92px] items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-background hover:bg-secondary/40",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function SettingsSessionControls() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resetTransientState = () => {
      setLogoutOpen(false);
      setDeleteOpen(false);
      setLoggingOut(false);
      setDeleting(false);
    };

    setMounted(true);
    resetTransientState();

    window.addEventListener("pageshow", resetTransientState);

    return () => {
      window.removeEventListener("pageshow", resetTransientState);
    };
  }, []);

  const logout = async () => {
    setLogoutOpen(false);
    setLoggingOut(true);
    setError(null);

    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/auth/login");
  };

  const deleteAccount = async () => {
    setDeleteOpen(false);
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error ?? "アカウント削除に失敗しました。");
      }

      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.replace("/auth/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "アカウント削除に失敗しました。");
      setDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">表示モード</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <ThemeButton
              active={mounted && theme === "light"}
              icon={<Sun size={16} />}
              label="ライト"
              onClick={() => setTheme("light")}
            />
            <ThemeButton
              active={mounted && theme === "dark"}
              icon={<Moon size={16} />}
              label="ダーク"
              onClick={() => setTheme("dark")}
            />
            <ThemeButton
              active={mounted && theme === "system"}
              icon={<Laptop size={16} />}
              label="端末設定"
              onClick={() => setTheme("system")}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">セッション</h2>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              disabled={loggingOut}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-secondary/40"
            >
              <LogOut size={16} />
              {loggingOut ? "ログアウト中..." : "ログアウト"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 text-sm font-semibold text-red-600 hover:bg-red-500/15 dark:text-red-300"
            >
              <Trash2 size={16} />
              {deleting ? "削除中..." : "アカウントを削除"}
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={logoutOpen}
        title="ログアウトしますか？"
        body="現在の端末からログアウトします。"
        confirmLabel="ログアウトする"
        busyLabel="ログアウト中..."
        busy={loggingOut}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={logout}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="アカウントを削除しますか？"
        body="アカウントと関連データを削除します。この操作は元に戻せません。"
        confirmLabel="削除する"
        busyLabel="削除中..."
        busy={deleting}
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteAccount}
      />
    </>
  );
}
