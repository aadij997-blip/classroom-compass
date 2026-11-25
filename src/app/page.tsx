import Image from "next/image";
import { redirect } from "next/navigation";
import { getTeacher, supabaseConfigured } from "@/lib/server/context";
import { startDemo } from "@/app/actions";
import { SignInForm } from "./sign-in-form";
import { CashTraysArt } from "@/components/art";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getTeacher()) redirect("/today");
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1180px] items-center gap-5 px-4 py-4 sm:px-8">
          <Image src="/brand/logo.png" alt="MoneyMind Games" width={1563} height={364} sizes="180px" priority className="h-auto w-[150px] sm:w-[180px]" />
          <span className="border-l border-line pl-5 text-[17px] font-semibold">Classroom Compass</span>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:py-14">
        <section className="relative overflow-hidden rounded-[28px] bg-pale p-7 sm:p-10">
          <p className="cue cue-white">For InvestQuest teachers · Grades 4–6</p>
          <h1 className="mt-5 max-w-[15ch] text-[38px] font-bold sm:text-[50px]">
            See what your students are learning — and know what to teach next.
          </h1>
          <p className="mt-4 max-w-[52ch] text-[18px] text-forest">
            Play the game. Ask two quick reflection questions. Get one clear, evidence-backed teaching move — and a ready-made activity to try together.
          </p>
          <ol className="mt-6 flex flex-wrap gap-2 text-[15px]" aria-label="How it works">
            {["Choose a goal", "Play", "Reflect", "See the thinking", "Teach", "Check again"].map((s, i) => (
              <li key={s} className={`cue ${i % 2 ? "cue-blush" : "cue-white"}`}>
                <span aria-hidden className="font-bold">{i + 1}</span> {s}
              </li>
            ))}
          </ol>
          <form action={startDemo} className="mt-8">
            <button className="btn btn-primary text-[17px]">Explore a sample class →</button>
            <p className="mt-2 text-[14px] text-forest">Fictional learners and responses. Nothing you do there touches a real class.</p>
          </form>
          <CashTraysArt className="pointer-events-none absolute -bottom-4 right-4 hidden w-[210px] opacity-95 xl:block" />
        </section>
        <section className="panel self-start">
          <h2 className="text-[22px] font-bold">Your classes</h2>
          <p className="mt-1 text-muted">
            {supabaseConfigured
              ? "Sign in or create a teacher account."
              : "Local trial mode: accounts and classes are stored only on this computer."}
          </p>
          <SignInForm />
          <div className="panel-quiet mt-6 text-[15px]">
            <strong>Learners:</strong> open the private link or QR code on the card your teacher gave you. No email or sign-in needed.
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-[1180px] px-4 pb-8 text-[13px] text-muted sm:px-8">
        Classroom Compass is a pilot companion to the physical InvestQuest game. Questions are original draft material requiring educator review. It does not rank students or score financial ability.
      </footer>
    </div>
  );
}
