import { useTheme } from "@/components/theme-provider";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const themes = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="border bg-muted/15 px-4 sm:px-6">
      <FieldGroup className="gap-0">
        <Field orientation="responsive" className="py-5">
          <FieldContent>
            <FieldLabel htmlFor="configuration-theme">Esquema de color</FieldLabel>
            <FieldDescription>Sigue el sistema o elige un tema claro u oscuro.</FieldDescription>
          </FieldContent>
          <Select
            items={themes}
            value={theme}
            onValueChange={(value) => {
              const next = themes.find((item) => item.value === value);
              if (next) setTheme(next.value);
            }}
          >
            <SelectTrigger id="configuration-theme" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {themes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </div>
  );
}
