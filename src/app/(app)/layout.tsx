import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/Sidebar";
import styles from "./shell.module.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
