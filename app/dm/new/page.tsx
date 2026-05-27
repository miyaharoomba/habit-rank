import { openDm } from "./actions";
import { redirect } from "next/navigation";

export default async function DmNewPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;

  if (!u) redirect("/dm");

  // サーバー側でスレッド作成(または取得)→そのままDMへリダイレクト
  await openDm(u);
  return null;
}