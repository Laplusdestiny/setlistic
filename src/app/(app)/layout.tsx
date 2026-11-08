import { Suspense } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/Sidebar";
import { ClipboardBanner } from "./ClipboardBanner";
import styles from "./shell.module.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <div className={styles.content}>{children}</div>
      {/* usePathname を使うので Suspense で包む（ない間は帯を出さないだけ） */}
      <Suspense fallback={null}>
        <ClipboardBanner />
      </Suspense>
    </div>
  );
}
