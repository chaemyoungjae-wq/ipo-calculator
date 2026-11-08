import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface Props {
  title: ReactNode;
  aside?: ReactNode;
  onClose: () => void;
  variant?: "bottom" | "drawer";
  children: ReactNode;
}

/** 화면 아래에서 올라오는 카드, 또는 왼쪽에서 나오는 사이드바. */
export function Sheet({ title, aside, onClose, variant = "bottom", children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className={`overlay overlay-${variant}`} onClick={onClose}>
      <div className={`sheet sheet-${variant}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {aside}
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
