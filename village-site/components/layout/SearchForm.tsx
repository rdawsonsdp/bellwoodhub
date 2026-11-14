import { Icon } from "@/components/ui/Icon";

// A plain GET form, so search works without JavaScript.
export function SearchForm({
  action,
  label,
  placeholder,
  buttonLabel,
  id,
  size = "md",
}: {
  action: string;
  label: string;
  placeholder: string;
  buttonLabel: string;
  id: string;
  size?: "md" | "lg";
}) {
  const big = size === "lg";
  return (
    <form action={action} method="get" role="search" className="w-full">
      <label htmlFor={id} className={big ? "mb-2 block text-base font-semibold" : "sr-only"}>
        {label}
      </label>
      <div className="flex w-full">
        <input
          id={id}
          name="q"
          type="search"
          placeholder={placeholder}
          autoComplete="off"
          className={`min-w-0 flex-1 rounded-l-lg border-2 border-r-0 border-navy-800 bg-white text-ink placeholder:text-ink-3 ${
            big ? "h-14 px-4 text-lg" : "h-11 px-3 text-base"
          }`}
        />
        <button
          type="submit"
          className={`inline-flex items-center gap-2 rounded-r-lg border-2 border-navy-800 bg-gold-400 font-bold text-navy-950 hover:bg-gold-500 ${
            big ? "h-14 px-5 text-lg" : "h-11 px-3"
          }`}
        >
          <Icon name="search" size={big ? 22 : 20} />
          <span className={big ? "" : "sr-only"}>{buttonLabel}</span>
        </button>
      </div>
    </form>
  );
}
