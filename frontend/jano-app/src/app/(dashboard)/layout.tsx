"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { useAuth } from "@/lib/auth/use-auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "anonymous") router.replace("/login");
  }, [auth.status, router]);

  if (auth.status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center text-jano-muted" role="status">
        Abriendo la puerta…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen gap-3.5 p-3.5">
      <Sidebar user={auth.user} />
      <main className="flex min-w-0 flex-1 flex-col gap-3.5">{children}</main>
    </div>
  );
}
