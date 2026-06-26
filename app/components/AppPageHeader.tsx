import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  Award,
  CalendarDays,
  ChartColumnIncreasing,
  History,
  Home,
  LifeBuoy,
  MessageCircle,
  Settings,
  Shield,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  mobileActionsInline?: boolean;
};

type HeaderLinkProps = {
  href: string;
  children: ReactNode;
  icon?: IconType;
  variant?: "ghost" | "primary" | "danger";
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  mobileActionsInline = false,
}: PageHeaderProps) {
  return (
    <header
      className={
        mobileActionsInline
          ? "flex items-start justify-between gap-3 sm:items-end"
          : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      }
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div
          className={
            mobileActionsInline
              ? "flex shrink-0 items-center gap-2"
              : "flex shrink-0 flex-wrap items-center gap-2"
          }
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function HeaderLink({
  href,
  children,
  icon: Icon,
  variant = "ghost",
}: HeaderLinkProps) {
  const styles = {
    ghost:
      "border-border bg-background text-foreground hover:bg-secondary/50",
    primary:
      "border-primary bg-primary text-primary-foreground hover:opacity-90",
    danger:
      "border-destructive bg-destructive text-destructive-foreground hover:opacity-90",
  };

  return (
    <Link
      href={href}
      className={[
        "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
        styles[variant],
      ].join(" ")}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden={true} /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function MainLink() {
  return (
    <HeaderLink href="/app" icon={Home}>
      メイン
    </HeaderLink>
  );
}

export function RankingLink() {
  return (
    <HeaderLink href="/ranking" icon={Trophy}>
      ランキング
    </HeaderLink>
  );
}

export function DmLink() {
  return (
    <HeaderLink href="/dm" icon={MessageCircle}>
      DM
    </HeaderLink>
  );
}

export function SettingsLink() {
  return (
    <HeaderLink href="/settings" icon={Settings}>
      設定
    </HeaderLink>
  );
}

export function ParticipantsLink() {
  return (
    <HeaderLink href="/participants" icon={Users}>
      参加者
    </HeaderLink>
  );
}

export function ProfileLink() {
  return (
    <HeaderLink href="/profile" icon={UserRound}>
      プロフィール
    </HeaderLink>
  );
}

export function CalendarLink() {
  return (
    <HeaderLink href="/calendar" icon={CalendarDays}>
      カレンダー
    </HeaderLink>
  );
}

export function ReportsLink() {
  return (
    <HeaderLink href="/reports" icon={ChartColumnIncreasing}>
      レポート
    </HeaderLink>
  );
}

export function HistoryLink() {
  return (
    <HeaderLink href="/history" icon={History}>
      履歴
    </HeaderLink>
  );
}

export function BadgesLink() {
  return (
    <HeaderLink href="/badges" icon={Award}>
      トロフィー
    </HeaderLink>
  );
}

export function SupportLink() {
  return (
    <HeaderLink href="/support" icon={LifeBuoy}>
      問い合わせ
    </HeaderLink>
  );
}

export function AdminLink() {
  return (
    <HeaderLink href="/admin" icon={Shield}>
      管理者
    </HeaderLink>
  );
}

export default PageHeader;
