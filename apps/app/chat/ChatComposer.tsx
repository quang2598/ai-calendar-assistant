import type { KeyboardEvent } from "react";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  helperText: string;
  errorText: string | null;
};

export default function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  helperText,
  errorText,
}: ChatComposerProps) {
  const canSend = !disabled && value.trim().length > 0;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  }

  return (
    <div className="border-t border-slate-800 bg-slate-950/90 p-4 sm:p-5">
      <div className="mx-auto w-full max-w-4xl space-y-2">
        <div className="flex items-center gap-2">
          <textarea
            rows={2}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[60px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="inline-flex min-w-20 items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          >
            {disabled ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-slate-100" />
            ) : (
              "Send"
            )}
          </button>
        </div>

        {errorText ? <p className="text-xs text-red-300">{errorText}</p> : null}
        <p className="text-xs text-slate-500">{helperText}</p>
      </div>
    </div>
  );
}
