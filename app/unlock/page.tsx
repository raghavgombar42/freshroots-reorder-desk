import { unlock } from "../actions";
import { Card, Flash, type SP } from "../ui";

export default function Unlock({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Flash searchParams={searchParams} />
      <Card title="Unlock the desk">
        <p className="mb-3 text-sm text-muted">Anyone can view. Running, approving, editing rules and uploading data need the operator passcode.</p>
        <form action={unlock} className="flex gap-2">
          <input name="passcode" type="password" required autoFocus placeholder="Operator passcode" className="flex-1 rounded-md border border-line px-3 py-2 text-sm" />
          <button className="rounded-md bg-rail px-4 py-2 text-sm font-semibold text-white">Unlock</button>
        </form>
      </Card>
    </div>
  );
}
