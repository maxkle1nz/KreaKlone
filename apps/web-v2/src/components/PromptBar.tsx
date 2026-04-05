import { useState, useCallback, useRef, useEffect } from "react";
import type { YlimitSessionHook } from "@/hooks/useYlimitSession";

type PromptBarProps = {
  status: YlimitSessionHook["status"];
  isGenerating: boolean;
  prompt: { positive: string; negative: string } | null;
  lastError: string | null;
  sendPromptUpdate: YlimitSessionHook["sendPromptUpdate"];
  sendGenerate: YlimitSessionHook["sendGenerate"];
  sendCancel: YlimitSessionHook["sendCancel"];
  burstCount: number;
  setBurstCount: (n: number) => void;
  onPromptChange: () => void;
  debounceCountdown: number | null;
};

export function PromptBar({
  status,
  isGenerating,
  prompt,
  lastError,
  sendPromptUpdate,
  sendGenerate,
  sendCancel,
  burstCount,
  onPromptChange,
  debounceCountdown,
}: PromptBarProps) {
  const [positive, setPositive] = useState(
    "a surreal cinematic landscape, golden hour, ultra detailed"
  );
  const [negative, setNegative] = useState("blurry, low quality, watermark");
  const [showNeg, setShowNeg] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastServerPrompt = useRef<{ positive: string; negative: string } | null>(null);

  useEffect(() => {
    if (!prompt) return;
    const nextPrompt = {
      positive: prompt.positive ?? "",
      negative: prompt.negative ?? "",
    };
    const previousServerPrompt = lastServerPrompt.current;
    lastServerPrompt.current = nextPrompt;
    const localMatchesPreviousServer = !previousServerPrompt
      || (positive === previousServerPrompt.positive && negative === previousServerPrompt.negative);
    if (syncTimer.current && !localMatchesPreviousServer) {
      return;
    }
    if (positive !== nextPrompt.positive) {
      setPositive(nextPrompt.positive);
    }
    if (negative !== nextPrompt.negative) {
      setNegative(nextPrompt.negative);
    }
  }, [negative, positive, prompt?.negative, prompt?.positive]);

  const syncPrompt = useCallback(
    (pos: string, neg: string) => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => sendPromptUpdate(pos, neg), 400);
      onPromptChange();
    },
    [sendPromptUpdate, onPromptChange]
  );

  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);

  const handleGenerate = useCallback(() => {
    sendPromptUpdate(positive, negative);
    sendGenerate(burstCount);
  }, [positive, negative, burstCount, sendPromptUpdate, sendGenerate]);

  return (
    <div className="yl-prompt-bar">
      <div className="yl-prompt-main-row">
        <button
          className={`yl-neg-toggle${showNeg ? " on" : ""}`}
          onClick={() => setShowNeg((v) => !v)}
          title={showNeg ? "Hide negative prompt" : "Show negative prompt"}
        >
          −
        </button>
        <textarea
          className="yl-prompt-input"
          value={positive}
          rows={1}
          placeholder="Describe the scene…"
          onChange={(e) => { setPositive(e.target.value); syncPrompt(e.target.value, negative); }}
        />
        {debounceCountdown !== null && !isGenerating && (
          <div className="yl-debounce-ring">
            <svg viewBox="0 0 20 20" width="20" height="20">
              <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(110,85,247,0.2)" strokeWidth="2" />
              <circle
                cx="10" cy="10" r="8"
                fill="none"
                stroke="#6e55f7"
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 8}`}
                strokeDashoffset={`${2 * Math.PI * 8 * (1 - debounceCountdown / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
              />
            </svg>
          </div>
        )}
        {isGenerating ? (
          <button className="yl-gen-btn yl-gen-cancel" onClick={sendCancel}>
            <span className="yl-gen-pulse" />
            Stop
          </button>
        ) : (
          <button
            className="yl-gen-btn"
            onClick={handleGenerate}
            disabled={status !== "connected"}
          >
            Gen
          </button>
        )}
      </div>

      {showNeg && (
        <div className="yl-neg-row">
          <textarea
            className="yl-prompt-input yl-prompt-neg"
            value={negative}
            rows={1}
            placeholder="Negative: what to avoid…"
            onChange={(e) => { setNegative(e.target.value); syncPrompt(positive, e.target.value); }}
          />
        </div>
      )}

      {lastError && (
        <div className="yl-prompt-status yl-prompt-status-error" role="status">
          {lastError}
        </div>
      )}
    </div>
  );
}
