import Link from "next/link";
import Image from "next/image";
import { requireTeacher } from "@/lib/server/context";
import { NavLinks } from "@/components/nav";
import { leaveDemo, resetDemo, signOutAction } from "@/app/actions";
import { buildOrientationContext } from "@/lib/server/orientation";
import { OrientationProvider } from "@/components/orientation/provider";
import { StartTourButton } from "@/components/orientation/start-tour";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const t = await requireTeacher();
  const orientation = await buildOrientationContext(t);
  return (
    <OrientationProvider ctx={orientation}>
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="no-print border-b border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <Link href="/today" className="flex items-center gap-3 sm:gap-5" aria-label="Classroom Compass by MoneyMind Games — Today">
            <Image src="/brand/logo.png" alt="MoneyMind Games" width={1563} height={364} sizes="180px" priority className="h-auto w-[128px] sm:w-[168px]" />
            <span className="border-l border-line pl-3 text-[15px] font-semibold sm:pl-5 sm:text-[17px]">Classroom Compass</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <NavLinks />
            <details className="relative">
              <summary className="btn btn-sm btn-secondary list-none">
                <span className="sr-only">Account: </span>
                {t.mode === "demo" ? "Sample" : t.displayName.slice(0, 18)}
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-2xl border border-line bg-white p-2 shadow-lg">
                <StartTourButton className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-neutral">
                  How it works <span className="block text-[13px] text-muted">A 2-minute sample walkthrough</span>
                </StartTourButton>
                {t.mode === "demo" ? (
                  <>
                    <form action={resetDemo}>
                      <button className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-neutral">Reset the sample class</button>
                    </form>
                    <form action={leaveDemo}>
                      <button className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-neutral">Leave the sample class</button>
                    </form>
                  </>
                ) : (
                  <form action={signOutAction}>
                    <button className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-neutral">Sign out</button>
                  </form>
                )}
              </div>
            </details>
          </div>
        </div>
        {t.mode === "demo" && (
          <div className="doodle-strip px-4 py-2 text-[14px] text-forest sm:px-8">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1">
              <strong>Sample class — fictional learners and responses.</strong>
              <span>Changes stay in this sample only and reset when you choose “Reset” or the server restarts. Sample storage cannot collect from other devices in a real classroom.</span>
            </div>
          </div>
        )}
        {t.mode === "local" && (
          <div className="bg-amber px-4 py-2 text-[14px] text-amber-ink sm:px-8">
            <div className="mx-auto max-w-[1280px]">
              <strong>Local trial storage.</strong> Saved only on this computer. It is not set up for classroom collection across devices — see the setup guide (README) to connect Supabase for real classes.
            </div>
          </div>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
        {children}
      </main>
      <footer className="no-print border-t border-line px-4 py-5 text-[13px] text-muted sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          Questions and activities are original pilot material and need educator review before use with real students. Short checks describe what learners showed on that check, not lasting ability.
        </div>
      </footer>
    </div>
    </OrientationProvider>
  );
}
