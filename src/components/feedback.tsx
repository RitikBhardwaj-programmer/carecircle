"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./icon";

/** Empty list: an icon, one sentence and one next step. */
export function EmptyState({
  icon,
  text,
  action,
}: {
  icon: IconName;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <p>{text}</p>
      {action ? (
        action.href ? (
          <Link className="btn btn-primary" href={action.href}>
            <Icon name="plus" />
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" onClick={action.onClick}>
            <Icon name="plus" />
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}

/**
 * GOV.UK-style error summary: a heading, the general message, and a link to each field with a problem.
 * It takes focus when it appears, so keyboard and screen-reader users land on it.
 */
export function ErrorSummary({
  title,
  message,
  fields = {},
  fieldIds = {},
}: {
  title: string;
  message: string;
  fields?: Record<string, string>;
  fieldIds?: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [message]);
  const entries = Object.entries(fields).filter(([key]) => fieldIds[key]);
  return (
    <div className="error-summary" role="alert" tabIndex={-1} ref={ref} aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">
        <Icon name="alert" />
        {title}
      </h2>
      <p className="form-error">{message}</p>
      {entries.length ? (
        <ul>
          {entries.map(([key, text]) => (
            <li key={key}>
              <a href={`#${fieldIds[key]}`}>{text}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Loading placeholder; `aria-busy` tells assistive technology the content is on its way. */
export function Skeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="skeleton" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} aria-hidden="true" />
      ))}
    </div>
  );
}
