import { unlock } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Flash, type SP } from "../ui";

export default function Unlock({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-md space-y-4 pt-4 lg:pt-10">
      <Flash searchParams={searchParams} />
      <section className="rounded-2xl border border-line bg-board p-6 shadow-sm">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-human-soft text-human">
          <Icon name="lock" className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Unlock the desk</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Anyone with the link can view. Running, approving, editing rules, uploading data and sending drafts to Zoho need the operator passcode.
        </p>
        <form action={unlock} className="mt-5 space-y-3">
          <label className="block text-[12px] font-medium text-muted" htmlFor="passcode">
            Operator passcode
          </label>
          <input id="passcode" name="passcode" type="password" required autoFocus autoComplete="current-password" className="field h-10 w-full" />
          <SubmitButton size="md" icon="unlock" pendingText="Checking…" className="w-full">
            Unlock
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
