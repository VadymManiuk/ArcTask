import type { ReactNode } from "react";

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function renderInline(value: string) {
  const cleaned = stripInlineMarkdown(value);
  const parts = cleaned.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="text-cyan-200 hover:underline">
          {part}
        </a>
      );
    }

    return part;
  });
}

function parseListItem(line: string) {
  return line.match(/^\s*(?:[-*]\s+|\d+[.)]\s+)(.+)$/)?.[1];
}

function parseHeading(line: string) {
  return line.match(/^\s{0,3}#{1,6}\s+(.+)$/)?.[1];
}

function parseCodeFence(line: string) {
  return line.match(/^\s*```([a-zA-Z0-9_-]+)?\s*$/)?.[1] ?? null;
}

function pushParagraph(blocks: ReactNode[], lines: string[], key: string) {
  if (lines.length === 0) {
    return;
  }

  blocks.push(
    <p key={key} className="text-sm leading-7 text-slate-200">
      {renderInline(lines.join(" "))}
    </p>
  );
  lines.length = 0;
}

function pushList(blocks: ReactNode[], lines: string[], key: string) {
  if (lines.length === 0) {
    return;
  }

  blocks.push(
    <ul key={key} className="space-y-2">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-3 text-sm leading-7 text-slate-200">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/80" aria-hidden="true" />
          <span>{renderInline(line)}</span>
        </li>
      ))}
    </ul>
  );
  lines.length = 0;
}

interface DeliverableSummaryProps {
  value?: string;
}

export function DeliverableSummary({ value }: DeliverableSummaryProps) {
  const source = value?.trim();
  if (!source) {
    return <p className="text-sm text-muted-foreground">The worker deliverable file did not include summary text.</p>;
  }

  const blocks: ReactNode[] = [];
  const paragraphLines: string[] = [];
  const listLines: string[] = [];
  const codeLines: string[] = [];
  let codeLanguage = "";

  for (const line of source.split(/\r?\n/)) {
    const codeFenceLanguage = parseCodeFence(line);
    if (codeFenceLanguage !== null || /^\s*```\s*$/.test(line)) {
      if (codeLanguage || codeLines.length > 0) {
        blocks.push(
          <pre
            key={`code-${blocks.length}`}
            className="overflow-auto rounded-lg border border-white/10 bg-slate-950/80 p-4 text-xs leading-6 text-slate-100"
          >
            {codeLines.join("\n")}
          </pre>
        );
        codeLanguage = "";
        codeLines.length = 0;
      } else {
        pushParagraph(blocks, paragraphLines, `p-${blocks.length}`);
        pushList(blocks, listLines, `list-${blocks.length}`);
        codeLanguage = codeFenceLanguage || "text";
      }
      continue;
    }

    if (codeLanguage) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      pushParagraph(blocks, paragraphLines, `p-${blocks.length}`);
      pushList(blocks, listLines, `list-${blocks.length}`);
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      pushParagraph(blocks, paragraphLines, `p-${blocks.length}`);
      pushList(blocks, listLines, `list-${blocks.length}`);
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="pt-2 text-base font-semibold text-white">
          {stripInlineMarkdown(heading)}
        </h3>
      );
      continue;
    }

    const listItem = parseListItem(line);
    if (listItem) {
      pushParagraph(blocks, paragraphLines, `p-${blocks.length}`);
      listLines.push(listItem);
      continue;
    }

    pushList(blocks, listLines, `list-${blocks.length}`);
    paragraphLines.push(trimmed);
  }

  pushParagraph(blocks, paragraphLines, `p-${blocks.length}`);
  pushList(blocks, listLines, `list-${blocks.length}`);
  if (codeLines.length > 0) {
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="overflow-auto rounded-lg border border-white/10 bg-slate-950/80 p-4 text-xs leading-6 text-slate-100"
      >
        {codeLines.join("\n")}
      </pre>
    );
  }

  return <div className="max-h-[42rem] space-y-4 overflow-auto rounded-md border border-border bg-muted/40 p-4">{blocks}</div>;
}
