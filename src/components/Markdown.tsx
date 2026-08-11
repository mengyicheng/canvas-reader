import React from "react";

/**
 * 轻量、安全的 Markdown → React 渲染器。
 * - 不依赖任何第三方库，也不使用 dangerouslySetInnerHTML（天然防 XSS）。
 * - 支持：标题、加粗、斜体、行内代码、围栏代码块、链接、有序/无序列表、
 *        引用块、分割线、表格、段落。
 * - 设计目标：把 AI 返回的 Markdown 文本渲染成排版良好的富文本。
 */

let keySeq = 0;
function k(): string {
  return "md" + keySeq++;
}

// 行内解析：加粗 **x** / __x__、斜体 *x* / _x_、行内代码 `x`、链接 [t](url)
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) out.push(<strong key={k()}>{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<strong key={k()}>{m[3]}</strong>);
    else if (m[4] !== undefined) out.push(<em key={k()}>{m[4]}</em>);
    else if (m[5] !== undefined) out.push(<em key={k()}>{m[5]}</em>);
    else if (m[6] !== undefined) out.push(<code key={k()} className="md-inline-code">{m[6]}</code>);
    else if (m[7] !== undefined && m[8] !== undefined) {
      const href = m[8];
      const safe = /^(https?:|mailto:|#|\/)/i.test(href) ? href : "#";
      out.push(
        <a key={k()} href={safe} target="_blank" rel="noreferrer noopener" className="md-link">
          {m[7]}
        </a>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parseTable(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const ln of lines) {
    const t = ln.trim();
    // 跳过分隔行：| --- | --- |
    if (/^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(t)) continue;
    const cells = t.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

export default function Markdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      const lang = line.replace(/^\s*(```|~~~)/, "").trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // 跳过结束围栏
      blocks.push(
        <pre key={k()} className="md-pre">
          {lang && <div className="md-pre-lang">{lang}</div>}
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // 分割线
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={k()} className="md-hr" />);
      i++;
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = ("h" + level) as keyof JSX.IntrinsicElements;
      blocks.push(
        <Tag key={k()} className={"md-h md-h" + level}>
          {renderInline(h[2].trim())}
        </Tag>
      );
      i++;
      continue;
    }

    // 表格（需连续 | 行，且下一行是分隔行）
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const tbl: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        tbl.push(lines[i]);
        i++;
      }
      const rows = parseTable(tbl);
      if (rows.length > 0) {
        blocks.push(
          <table key={k()} className="md-table">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      continue;
    }

    // 引用块（连续 > 行）
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={k()} className="md-quote">
          {quote.map((q, qi) => (
            <p key={qi}>{renderInline(q)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={k()} className="md-ul">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={k()} className="md-ol">
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 空行
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // 段落（聚合直到空行 / 下一块）
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*(```|~~~)/.test(lines[i]) &&
      !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={k()} className="md-p">
        {renderInline(para.join(" "))}
      </p>
    );
  }

  return <div className="md-body">{blocks}</div>;
}
