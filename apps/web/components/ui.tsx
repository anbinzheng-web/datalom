'use client';
import Link from 'next/link';
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const controlSizes: Record<ControlSize, string> = {
  xs: 'h-7 px-1.5 text-xs',
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-2.5 text-sm',
  lg: 'h-10 px-3 text-sm',
  xl: 'h-11 px-3 text-sm',
};
const buttonSizes: Record<ControlSize, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-sm',
  xl: 'h-11 px-6 text-sm',
};
type ButtonStyle = { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: ControlSize };
const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ');
const buttonClass = ({ variant = 'primary', size = 'lg' }: ButtonStyle, extra?: string) =>
  cx(
    'ui-button inline-flex box-border py-0 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-solid border-transparent text-center font-medium leading-[1.4] no-underline transition-colors duration-150 aria-pressed:bg-lime aria-pressed:text-brand aria-selected:bg-lime aria-selected:text-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
    buttonSizes[size],
    variant === 'primary' ? 'bg-brand text-white hover:bg-brand-hover' : '',
    variant === 'secondary' ? 'bg-[var(--control-bg)] text-ink hover:bg-[var(--control-hover-bg)]' : '',
    variant === 'quiet' ? 'border-transparent bg-transparent text-ink hover:bg-soft' : '',
    variant === 'danger' ? 'bg-danger text-white enabled:hover:brightness-95' : '',
    extra,
  );
const controlClass =
  'ui-control block box-border w-full min-w-0 rounded-sm border border-solid border-transparent bg-[var(--control-bg)] py-0 leading-normal text-ink transition-[background-color,border-color,box-shadow] duration-150 enabled:hover:not-focus:bg-[var(--control-hover-bg)] aria-invalid:enabled:hover:not-focus:bg-[var(--error-bg)] focus:border-brand focus:bg-surface focus:outline-hidden focus:ring-3 focus:ring-brand/10 placeholder:text-muted aria-invalid:bg-[var(--error-bg)] aria-invalid:focus:border-danger aria-invalid:focus:bg-surface aria-invalid:focus:ring-danger/10 disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)] disabled:opacity-65';
const messageTones = {
  info: 'bg-[var(--info-bg)] text-[var(--blue)]',
  success: 'bg-[var(--success-bg)] text-[var(--teal)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--amber)]',
  error: 'bg-[var(--error-bg)] text-danger',
};
export function Button({
  variant,
  size,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: ComponentProps<'button'> & ButtonStyle & { loading?: boolean }) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size }, className)}
    >
      {loading && (
        <span
          className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link {...props} className={buttonClass({ variant, size }, className)} />;
}
export function ButtonAnchor({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'a'> & ButtonStyle) {
  return <a {...props} className={buttonClass({ variant, size }, className)} />;
}
export function Input({
  size = 'lg',
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & { size?: ControlSize }) {
  return <input {...props} className={cx(controlClass, controlSizes[size], className)} />;
}
export function Select({
  size = 'lg',
  className,
  options,
  placeholder = 'Select an option',
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  ...triggerProps
}: Pick<
  ComponentProps<typeof SelectPrimitive.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'name' | 'required' | 'disabled'
> &
  Omit<
    ComponentProps<typeof SelectPrimitive.Trigger>,
    'children' | 'value' | 'defaultValue' | 'name'
  > & {
    size?: ControlSize;
    placeholder?: string;
    options: { value: string; label: string; disabled?: boolean }[];
  }) {
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      required={required}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        {...triggerProps}
        className={cx(
          controlClass,
          controlSizes[size],
          'flex items-center justify-between gap-2 text-left data-[placeholder]:text-muted [&>span:first-child]:truncate',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="shrink-0 text-muted"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border-0 bg-surface text-ink shadow-md"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
            ⌃
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cx(
                  controlSizes[size],
                  'relative flex box-border cursor-pointer items-center justify-between gap-2 rounded-sm py-0 leading-normal outline-none data-[highlighted]:bg-soft data-[highlighted]:text-brand data-[state=checked]:text-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>span:first-child]:truncate',
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="flex shrink-0 items-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
            ⌄
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
export function Textarea({
  size = 'lg',
  className,
  ...props
}: ComponentProps<'textarea'> & { size?: ControlSize }) {
  return (
    <textarea {...props} className={cx(controlClass, controlSizes[size], 'resize-y', className)} />
  );
}
export function Form({ className, ...props }: ComponentProps<'form'>) {
  return <form {...props} className={cx('grid gap-5', className)} />;
}
export function Field({
  label,
  hint,
  error,
  children,
  id: suppliedId,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement;
  id?: string;
}) {
  const generatedId = useId();
  const child = Children.only(children) as ReactElement<{
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean | 'true' | 'false';
  }>;
  const id = suppliedId ?? child.props.id ?? generatedId;
  const describedBy =
    cx(
      child.props['aria-describedby'],
      hint ? id + '-hint' : undefined,
      error ? id + '-error' : undefined,
    ) || undefined;
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {cloneElement(child, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : child.props['aria-invalid'],
      })}
      {hint && (
        <p id={id + '-hint'} className="m-0 text-[13px] leading-normal text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={id + '-error'} className="m-0 text-[13px] leading-normal text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Message({
  tone = 'info',
  children,
  onDismiss,
  dismissLabel = 'Dismiss message',
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex items-start justify-between gap-3 rounded-sm p-4 text-sm leading-relaxed',
        messageTones[tone],
        className,
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div>{children}</div>
      {onDismiss && (
        <Button variant="quiet" size="sm" aria-label={dismissLabel} onClick={onDismiss}>
          ×
        </Button>
      )}
    </div>
  );
}
export function AccordionItem({
  title,
  children,
  className,
  ...props
}: Omit<ComponentProps<'details'>, 'title'> & { title: ReactNode }) {
  return (
    <details {...props} className={cx('group/accordion rounded-md bg-soft px-5', className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <span
          className="shrink-0 transition-transform duration-150 group-open/accordion:rotate-45 motion-reduce:transition-none"
          aria-hidden="true"
        >
          +
        </span>
      </summary>
      <div className="pb-5 leading-[1.7] text-muted [&>p]:m-0">{children}</div>
    </details>
  );
}
export function Accordion({
  items,
  multiple = false,
}: {
  items: { id: string; title: ReactNode; content: ReactNode }[];
  multiple?: boolean;
}) {
  const name = useId();
  return (
    <div className="ui-accordion grid gap-2">
      {items.map((item) => (
        <AccordionItem key={item.id} name={multiple ? undefined : name} title={item.title}>
          {item.content}
        </AccordionItem>
      ))}
    </div>
  );
}
let modalCount = 0;
let previousOverflow = '';
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Close dialog',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    if (modalCount++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      dialog.close();
      if (--modalCount === 0) document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-48px)] w-[min(560px,calc(100vw-32px))] overflow-auto rounded-lg border-0 bg-surface p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-[3px]"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const targets = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex]',
          ),
        ).filter(
          (node) => !node.matches(':disabled, [tabindex="-1"]') && node.getClientRects().length > 0,
        );
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex items-center justify-between gap-4 px-6 py-5 [&>h2]:m-0 [&>h2]:text-xl">
        <h2 id={titleId}>{title}</h2>
        <Button variant="quiet" size="sm" onClick={onClose} aria-label={closeLabel}>
          ×
        </Button>
      </div>
      <div className="p-[var(--panel-padding)]">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-4 px-6 py-5">{footer}</div>
      )}
    </dialog>
  );
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <table
      {...props}
      className={cx(
        'w-full border-collapse text-left text-sm [&_th]:bg-[var(--table-header)] [&_th]:px-4 [&_th]:py-3 [&_th]:align-middle [&_th]:font-medium [&_th]:text-ink [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_td]:[overflow-wrap:anywhere] [&_tbody>tr:nth-child(odd)]:bg-surface [&_tbody>tr:nth-child(even)]:bg-[var(--table-stripe)]',
        className,
      )}
    />
  );
}
