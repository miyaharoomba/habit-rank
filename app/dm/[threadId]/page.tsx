import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Input from "@/app/components/ui/Input";
import Button from "@/app/components/ui/Button";

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sendDm } from "./actions";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default async function DmThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: msgs, error } = await supabase
    .from("dm_messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader><h1 className="text-xl font-bold">DM</h1></CardHeader>
          <CardBody><p className="text-sm text-destructive">取得エラー: {error.message}</p></CardBody>
        </Card>
      </Container>
    );
  }

  const messages = (msgs ?? []) as Message[];

  return (
    <Container>
      <header className="flex items-end justify-between">
        <h1 className="text-2xl font-bold tracking-tight">DM</h1>
        <div className="flex gap-2">
          <Link className="text-sm text-primary hover:underline" href="/dm">←一覧</Link>
          <Link className="text-sm text-primary hover:underline" href="/app">/app</Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader><h2 className="font-semibold">メッセージ</h2></CardHeader>
          <CardBody>
            <div className="space-y-2">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">まだメッセージがありません。</p>
              ) : (
                messages.map(m => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 border border-border ${mine ? "bg-primary/10" : "bg-secondary/40"}`}>
                        <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground text-right">
                          {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form action={sendDm.bind(null, threadId)} className="mt-4 flex gap-2">
              <Input name="body" placeholder="メッセージ..." />
              <Button type="submit">送信</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}