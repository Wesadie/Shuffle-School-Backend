import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { characteristicValueToArray } from "@shared/characteristics";
import type { CharacteristicResponse } from "@shared/schema";

export function RosterMultiSelectCell({ value, options, responses, saving, onSave }: {
  value: string | string[] | undefined;
  options: string[];
  responses?: Map<string, CharacteristicResponse>;
  saving: boolean;
  onSave: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const initial = useRef<string[]>([]);
  const draftRef = useRef<string[]>([]);
  const active = useRef(false);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => () => {
    if (active.current && JSON.stringify(initial.current) !== JSON.stringify(draftRef.current)) saveRef.current(draftRef.current);
  }, []);
  const close = () => {
    active.current = false;
    if (JSON.stringify(initial.current) !== JSON.stringify(draftRef.current)) onSave(draftRef.current);
    setOpen(false);
  };
  const selected = open ? draft : characteristicValueToArray(value);
  const allOptions = Array.from(new Set([...selected, ...options]));
  return <Popover open={open} onOpenChange={(next) => {
    if (next) {
      initial.current = characteristicValueToArray(value);
      draftRef.current = initial.current;
      active.current = true;
      setDraft(initial.current);
      setOpen(true);
    } else close();
  }}>
    <PopoverTrigger asChild><button type="button" disabled={saving || !allOptions.length} aria-busy={saving} className="flex h-8 min-w-32 max-w-56 items-center gap-1.5 truncate rounded-sm text-left hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60" title={saving ? "Saving changes…" : "Select values"}>
      {selected.slice(0, 3).map((name) => responses?.get(name) ? <span key={name} className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: responses.get(name)!.color }} /> : null)}
      <span className="truncate">{selected.length ? selected.join(", ") : "—"}</span>{saving && <span className="text-xs">Saving…</span>}
    </button></PopoverTrigger>
    <PopoverContent className="w-64 max-h-80 overflow-auto" align="start">
      <p className="text-sm font-medium mb-2">Select responses</p>
      <p className="text-xs text-muted-foreground mb-3">Changes save together when you close this menu.</p>
      <div className="space-y-2">{allOptions.map((option) => <label key={option} className="flex cursor-pointer items-center gap-2 rounded-sm p-1 text-sm hover:bg-muted">
        <Checkbox checked={draft.includes(option)} onCheckedChange={(checked) => {
          const next = checked === true ? [...draftRef.current, option] : draftRef.current.filter((name) => name !== option);
          draftRef.current = next;
          setDraft(next);
        }} />
        {responses?.get(option) && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: responses.get(option)!.color }} />}<span>{option}</span>
      </label>)}</div>
      <button type="button" className="mt-3 text-sm text-primary" onClick={close}>Done</button>
    </PopoverContent>
  </Popover>;
}
