import { useEffect } from "react";

interface ToastProps {
  /** 표시할 메시지. null이면 렌더하지 않는다 */
  message: string | null;
  onDone: () => void;
  duration?: number;
}

/**
 * 최소 토스트 — 한도 안내 등 일시적 피드백용.
 * TDS useToast는 앱브릿지/라이트 테마 의존이라, 앱 토큰으로 가볍게 구현한다.
 */
export function Toast({ message, onDone, duration = 2000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(id);
  }, [message, duration, onDone]);

  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
