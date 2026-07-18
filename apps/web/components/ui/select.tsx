"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}

function Select({ label, value, onValueChange, options, placeholder, disabled, className }: SelectProps) {
  return (
    <SelectPrimitive.Root
      items={options}
      value={value || null}
      onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "field flex w-full items-center gap-2 text-left hover:border-ring/60",
          className,
        )}
      >
        <SelectPrimitive.Value className="min-w-0 flex-1 truncate" placeholder={placeholder} />
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
          <ChevronDown className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner align="start" alignItemWithTrigger={false} sideOffset={6} className="z-50">
          <SelectPrimitive.Popup className="w-max min-w-[var(--anchor-width)] max-w-[min(36rem,var(--available-width))] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <SelectPrimitive.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="cursor-default rounded-md px-2.5 py-2 text-sm leading-5 break-words whitespace-normal outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:font-medium"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select };
export type { SelectOption };
