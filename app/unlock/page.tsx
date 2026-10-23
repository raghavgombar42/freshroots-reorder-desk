import { unlock } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Flash, type SP } from "../ui";

export default function Unlock({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-6 lg:pt-14">
      <Flash searchParams={searchParams} />
      <section className="rounded-xl border border-line bg-board p-6 shadow-[0_1px_2px_rgba(28,28,24,0.03)]">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-rail-soft text-rail">
          <Icon name="lock" className="h-4.5 w-4.5" />
        </div>
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">Unlock the desk</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
          Anyone with the link can view. Running, approving, editing rules, uploading data and sending drafts to Zoho need the operator passcode.
        </p>
        <form action={unlock} className="mt-5 space-y-3">
          <label className="block text-[12.5px] font-medium text-muted" htmlFor="passcode">
            Operator passcode
          </label>
          <input id="passcode" name="passcode" type="password" required autoFocus autoComplete="current-password" className="field w-full" />
          <SubmitButton variant="primary" size="md" icon="unlock" pendingText="Checking…" className="w-full">
            Unlock
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
