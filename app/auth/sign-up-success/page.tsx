import { AuthShell } from "@/components/auth-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">登録を受け付けました</CardTitle>
          <CardDescription>メールを確認してください</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            登録したメールアドレス宛に確認リンクを送信しました。メール内のリンクを開くとアカウント確認が完了します。
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
