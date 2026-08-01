import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string; hint?: string };

/**
 * Eigenes Auswahlfeld statt <select>: Browser lassen die native Optionsliste
 * kaum gestalten (macOS ignoriert eigene Farben komplett), daher ein
 * Listbox-Muster mit Tastaturbedienung.
 */
export default function Select({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((option) => option.value === value);

  // Klick außerhalb schließt die Liste
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const index = options.findIndex((option) => option.value === value);
      setHighlighted(index >= 0 ? index : 0);
    }
  }, [open, options, value]);

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + options.length) % options.length;
      });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[highlighted];
      if (option) choose(option);
    }
  }

  return (
    <div className={`select${open ? ' open' : ''}`} ref={wrapperRef}>
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? 'select-value' : 'select-value placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.hint && <span className="select-hint">{selected.hint}</span>}
        <ChevronDown className="select-chevron" size={18} aria-hidden />
      </button>

      {open && (
        <ul className="select-list" role="listbox" id={listId} tabIndex={-1}>
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={index === highlighted ? 'highlighted' : undefined}
              onMouseEnter={() => setHighlighted(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="select-option-label">{option.label}</span>
              {option.hint && <span className="select-hint">{option.hint}</span>}
              {option.value === value && <Check size={16} className="select-check" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
