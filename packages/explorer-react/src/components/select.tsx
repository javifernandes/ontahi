'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { cx } from '../internal/cx.js';

export type ExplorerSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type ExplorerSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: ExplorerSelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
};

const firstEnabledOptionIndex = (options: ExplorerSelectOption[]) =>
  options.findIndex(option => !option.disabled);

const nextEnabledOptionIndex = (
  options: ExplorerSelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) => {
  if (options.length === 0) {
    return -1;
  }

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (currentIndex + direction * offset + options.length) % options.length;

    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
};

export function ExplorerSelect({
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  className,
  disabled = false,
  onValueChange,
  options,
  placeholder,
  required = false,
  triggerClassName,
  value,
}: ExplorerSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex(option => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const [activeIndex, setActiveIndex] = useState(() =>
    selectedIndex >= 0 ? selectedIndex : firstEnabledOptionIndex(options),
  );

  const focusOption = useCallback((index: number) => {
    if (index < 0) {
      return;
    }

    setActiveIndex(index);
    globalThis.setTimeout(() => optionRefs.current[index]?.focus(), 0);
  }, []);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);

    if (restoreFocus) {
      globalThis.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  const openAt = useCallback(
    (index: number) => {
      setOpen(true);
      focusOption(index >= 0 ? index : firstEnabledOptionIndex(options));
    },
    [focusOption, options],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledOptionIndex(options));
    }
  }, [open, options, selectedIndex]);

  const selectOption = (option: ExplorerSelectOption) => {
    if (option.disabled) {
      return;
    }

    onValueChange(option.value);
    close(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;

      if (!open) {
        openAt(selectedIndex >= 0 ? selectedIndex : firstEnabledOptionIndex(options));
        return;
      }

      focusOption(nextEnabledOptionIndex(options, activeIndex, direction));
      return;
    }

    if (open && event.key === 'Home') {
      event.preventDefault();
      focusOption(firstEnabledOptionIndex(options));
      return;
    }

    if (open && event.key === 'End') {
      event.preventDefault();
      const reversedIndex = [...options].reverse().findIndex(option => !option.disabled);
      focusOption(reversedIndex < 0 ? -1 : options.length - reversedIndex - 1);
    }
  };

  return (
    <div ref={rootRef} className={cx('relative min-w-0', className)} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type='button'
        role='combobox'
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required}
        disabled={disabled}
        onClick={() => (open ? close() : openAt(selectedIndex))}
        className={cx(
          'flex min-h-10 w-full items-center justify-between gap-3 rounded-md border bg-background px-3 text-left text-sm text-foreground outline-none transition-colors',
          'hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
          triggerClassName,
        )}
      >
        <span className={cx('min-w-0 flex-1 truncate', !selectedOption && 'text-muted-foreground')}>
          {selectedOption?.label ?? placeholder ?? 'Select an option'}
        </span>
        <ChevronDown
          className={cx(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180 text-foreground',
          )}
        />
      </button>

      {open ? (
        <div
          id={listboxId}
          role='listbox'
          aria-label={ariaLabel}
          className='absolute left-0 right-0 top-[calc(100%+0.375rem)] z-50 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg'
        >
          {options.map((option, index) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                ref={node => {
                  optionRefs.current[index] = node;
                }}
                type='button'
                role='option'
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cx(
                  'relative flex min-h-9 w-full items-center rounded px-8 py-1.5 text-left text-sm outline-none transition-colors',
                  'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                  selected && 'bg-primary/10 text-foreground',
                  index === activeIndex && 'bg-accent text-accent-foreground',
                  option.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className='absolute left-2 flex size-4 items-center justify-center'>
                  {selected ? <Check className='size-4 text-primary' /> : null}
                </span>
                <span className='truncate'>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
