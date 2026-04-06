import type { KeyboardEvent } from "react";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  helperText: string;
  errorText: string | null;
  isListening?: boolean;
  isVoiceSupported?: boolean;
  onMicToggle?: () => void;
  micVolume?: number;
  micFrequencies?: number[];
};

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x={9} y={2} width={6} height={11} rx={3} />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1={12} y1={19} x2={12} y2={22} />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x={6} y={6} width={12} height={12} rx={2} />
    </svg>
  );
}

function AudioWaveform({ frequencies }: { frequencies: number[] }) {
  return (
    <div className="flex h-full items-center justify-center gap-[3px] px-4">
      {frequencies.map((value, index) => {
        const height = Math.max(4, value * 48);
        return (
          <div
            key={index}
            className="w-[3px] rounded-full bg-cyan-400"
            style={{
              height,
              opacity: 0.4 + value * 0.6,
              transition: "height 0.08s ease-out, opacity 0.08s ease-out",
            }}
          />
        );
      })}
    </div>
  );
}

export default function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  helperText,
  errorText,
  isListening = false,
  isVoiceSupported = false,
  onMicToggle,
  micVolume = 0,
  micFrequencies = [],
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

  const ringScale = isListening ? 1 + micVolume * 0.8 : 1;
  const ringOpacity = isListening ? 0.3 + micVolume * 0.5 : 0;

  return (
    <div className="border-t border-slate-800 bg-slate-950/90 p-4 sm:p-5">
      <div className="mx-auto w-full max-w-4xl space-y-2">
        {isListening ? (
          <div className="flex items-center gap-2">
            <div className="min-h-[60px] flex-1 overflow-hidden rounded-2xl border border-cyan-400/40 bg-slate-900 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
              <AudioWaveform frequencies={micFrequencies} />
            </div>
            <div className="relative flex items-center justify-center">
              <span
                className="absolute rounded-full bg-cyan-400"
                style={{
                  width: 46,
                  height: 46,
                  transform: `scale(${ringScale})`,
                  opacity: ringOpacity,
                  transition: "transform 0.1s ease-out, opacity 0.1s ease-out",
                }}
              />
              <span
                className="absolute rounded-full bg-cyan-400"
                style={{
                  width: 46,
                  height: 46,
                  transform: `scale(${1 + micVolume * 1.2})`,
                  opacity: ringOpacity * 0.4,
                  transition: "transform 0.15s ease-out, opacity 0.15s ease-out",
                }}
              />
              <button
                type="button"
                onClick={onMicToggle}
                className="relative z-10 inline-flex h-[46px] w-[46px] items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400"
                title="Stop listening"
              >
                <StopIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <textarea
              rows={2}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="min-h-[60px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-300 outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
            />
            {isVoiceSupported && onMicToggle && (
              <button
                type="button"
                onClick={onMicToggle}
                disabled={disabled}
                className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-full bg-slate-700 text-slate-300 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                title="Start voice input"
              >
                <MicIcon className="h-5 w-5" />
              </button>
            )}
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
        )}

        {isListening && (
          <p className="text-center text-xs text-cyan-400">Listening... Speak now</p>
        )}
        {!isListening && errorText ? <p className="text-xs text-red-300">{errorText}</p> : null}
        {!isListening && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    </div>
  );
}
