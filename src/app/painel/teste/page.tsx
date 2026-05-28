import { headers } from "next/headers";
import TesteClient from "./client";

export const dynamic = "force-dynamic";
export const dynamicParams = true;
export const revalidate = 0;

export default function Page() {
  headers();
  return <TesteClient />;
}
