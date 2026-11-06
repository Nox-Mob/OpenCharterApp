import type { ReactNode } from "react";

/** Building blocks for the legal text in `src/content/legal.tsx` (D-210). */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Paras({ items }: { items: ReactNode[] }) {
  return (
    <>
      {items.map((item, i) => (
        <p key={i}>{item}</p>
      ))}
    </>
  );
}

export function Sub({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{heading}</h3>
      {children}
    </div>
  );
}
