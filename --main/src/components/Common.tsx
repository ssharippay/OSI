import { Building2, Check, Wallet, X, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Building2 size={26} />
      </span>
      <span>
        ҮйКөмек<small>Ваш дом, в порядке</small>
      </span>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "status " +
        (["Выполнено", "Опубликован"].includes(value)
          ? "done"
          : ["В работе", "Черновик"].includes(value)
            ? "progress"
            : "new")
      }
    >
      {["Выполнено", "Опубликован"].includes(value) ? (
        <Check size={12} />
      ) : (
        <span />
      )}
      {value}
    </span>
  );
}
export function Summary({
  title,
  value,
  onClick,
}: {
  title: string;
  value: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="icon-tile teal">
        <Wallet />
      </span>
      <span>
        <small>{title}</small>
        <strong>{value}</strong>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className="stat" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="stat">{content}</div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const node = ref.current;
    const items = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea,select,[tabindex="0"]',
        ) || [],
      );
    items()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const list = items();
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={ref}
        className={"modal " + (wide ? "modal-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
export function Toast({ text, close }: { text: string; close: () => void }) {
  useEffect(() => {
    const timer = setTimeout(close, 8000);
    return () => clearTimeout(timer);
  }, [text, close]);
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={19} />
      {text}
      <button aria-label="Закрыть уведомление" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
export function download(
  title: string,
  body: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = title;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="month-picker">
      Отчетный месяц
      <input
        aria-label="Отчетный месяц"
        type="month"
        required
        value={value}
        onChange={(e) => {
          if (/^\d{4}-\d{2}$/.test(e.target.value)) onChange(e.target.value);
        }}
      />
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
